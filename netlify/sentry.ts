// Function telemetry. One OpenTelemetry span per request, continued from the browser's traceparent and exported
// over OTLP to Sentry (SENTRY_DSN) and Grafana Cloud (OTEL_EXPORTER_OTLP_ENDPOINT + OTEL_EXPORTER_OTLP_HEADERS).
// Thrown errors and error responses (status >= 400) go to Sentry, attached to that span. Each backend is off when
// its env is unset.
// Soft fail: telemetry never throws into, or holds up, the function. A failed setup turns it off; a failed span,
// report or flush is logged and skipped; the flush is capped at FLUSH_MS. The handler runs exactly once either way.

import * as Sentry from '@sentry/node'
import { context, propagation, SpanStatusCode, trace, type Attributes, type Span } from '@opentelemetry/api'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import { W3CTraceContextPropagator } from '@opentelemetry/core'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { BatchSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace'

type Handler = (req: Request) => Promise<Response>

const FLUSH_MS = 1_000

// Runs fn; a throw is logged and swallowed.
function safely<T>(what: string, fn: () => T): T | undefined {
  try {
    return fn()
  } catch (err) {
    console.warn(`telemetry: ${what} failed`, err)
  }
}

// Settles within ms, never rejects.
const capped = (what: string, promise: Promise<unknown>, ms: number) =>
  Promise.race([promise, new Promise(resolve => setTimeout(resolve, ms))]).catch(err => console.warn(`telemetry: ${what} failed`, err))

// OTEL_EXPORTER_OTLP_HEADERS: "Key=value,Key2=value2" (OTel's format).
const parseHeaders = (raw = '') =>
  // Split at the first "=" only: base64 credentials end in "=" padding.
  Object.fromEntries(raw.split(',').filter(Boolean).map(pair => [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)].map(decodeURIComponent).map(s => s.trim())))

function setup() {
  const dsn = process.env.SENTRY_DSN
  const grafana = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  const exporters = [
    dsn && Sentry.getOtlpTracesEndpoint(dsn),
    grafana && { url: `${grafana.replace(/\/$/, '')}/v1/traces`, headers: parseHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS) },
  ].filter(Boolean) as { url: string; headers: Record<string, string> }[]
  if (!exporters.length && !dsn) return
  const provider = new TracerProvider({ spanProcessors: exporters.map(options => new BatchSpanProcessor({ exporter: new OTLPTraceExporter(options) })) })
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())
  propagation.setGlobalPropagator(new W3CTraceContextPropagator())
  trace.setGlobalTracerProvider(provider)
  if (dsn) Sentry.init({ dsn, integrations: [Sentry.openTelemetryIntegration()] })
  return { provider, sentry: !!dsn, tracer: trace.getTracer('homepage-2026') }
}

const telemetry = safely('setup', setup)

// Adds attributes to the current request's span (no-op when telemetry is off).
export const setSpanAttributes = (attributes: Attributes) => safely('attributes', () => trace.getActiveSpan()?.setAttributes(attributes))

async function reportResponse(name: string, res: Response, span: Span) {
  span.setAttribute('http.response.status_code', res.status)
  if (res.status >= 500) span.setStatus({ code: SpanStatusCode.ERROR })
  if (res.status < 400 || !telemetry?.sentry) return
  const body = await res.clone().text()
  Sentry.captureMessage(`${name} ${res.status}`, { level: res.status >= 500 ? 'error' : 'warning', tags: { function: name, status: res.status }, extra: { body } })
}

function reportError(name: string, err: unknown, span: Span) {
  span.recordException(err as Error)
  span.setStatus({ code: SpanStatusCode.ERROR })
  if (telemetry?.sentry) Sentry.captureException(err, { tags: { function: name } })
}

const flush = () =>
  capped('flush', Promise.all([telemetry?.provider.forceFlush(), telemetry?.sentry && Sentry.flush(FLUSH_MS)]), FLUSH_MS)

async function traced(name: string, handler: Handler, req: Request) {
  const { tracer } = telemetry!
  const parent = propagation.extract(context.active(), Object.fromEntries(req.headers))
  const attributes = { 'http.request.method': req.method, 'url.path': new URL(req.url).pathname }
  return tracer.startActiveSpan(name, { attributes }, parent, async span => {
    try {
      const res = await handler(req)
      await capped('report', reportResponse(name, res, span), FLUSH_MS)
      return res
    } catch (err) {
      safely('report', () => reportError(name, err, span))
      throw err
    } finally {
      safely('span end', () => span.end())
      await flush()
    }
  })
}

// Callers whose requests send no telemetry (TELEMETRY_IGNORE_IPS, comma list), e.g. the owner testing the live site.
const IGNORED_IPS = new Set((process.env.TELEMETRY_IGNORE_IPS ?? '').split(',').map(ip => ip.trim()).filter(Boolean))
const ignored = (req: Request) => IGNORED_IPS.has(req.headers.get('x-nf-client-connection-ip') ?? '')

// The handler with telemetry around it; if telemetry is off, the caller is ignored, or its span can't start, the
// plain handler.
export const withSentry = (name: string, handler: Handler): Handler =>
  !telemetry
    ? handler
    : req => {
        if (ignored(req)) return handler(req)
        let ran = false
        const once: Handler = r => ((ran = true), handler(r))
        try {
          return traced(name, once, req).catch(err => {
            if (ran) throw err
            console.warn('telemetry: span failed', err)
            return handler(req)
          })
        } catch (err) {
          console.warn('telemetry: span failed', err)
          return ran ? Promise.reject(err) : handler(req)
        }
      }
