// Function telemetry. One OpenTelemetry span per request, continued from the browser's traceparent and exported
// over OTLP to Sentry (SENTRY_DSN) and Grafana Cloud (OTEL_EXPORTER_OTLP_ENDPOINT + OTEL_EXPORTER_OTLP_HEADERS).
// Thrown errors and error responses (status >= 400) go to Sentry, attached to that span. Each backend is off when
// its env is unset.

import * as Sentry from '@sentry/node'
import { context, propagation, SpanStatusCode, trace, type Attributes } from '@opentelemetry/api'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import { W3CTraceContextPropagator } from '@opentelemetry/core'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { BatchSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace'

type Handler = (req: Request) => Promise<Response>

const DSN = process.env.SENTRY_DSN
const GRAFANA_URL = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
const FLUSH_MS = 2_000

// OTEL_EXPORTER_OTLP_HEADERS: "Key=value,Key2=value2" (OTel's format).
const parseHeaders = (raw = '') =>
  Object.fromEntries(raw.split(',').filter(Boolean).map(pair => pair.split('=').map(decodeURIComponent).map(s => s.trim())))

const exporters = [
  DSN && Sentry.getOtlpTracesEndpoint(DSN),
  GRAFANA_URL && { url: `${GRAFANA_URL.replace(/\/$/, '')}/v1/traces`, headers: parseHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS) },
].filter(Boolean) as { url: string; headers: Record<string, string> }[]

const provider = new TracerProvider({ spanProcessors: exporters.map(options => new BatchSpanProcessor({ exporter: new OTLPTraceExporter(options) })) })
if (exporters.length) {
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())
  propagation.setGlobalPropagator(new W3CTraceContextPropagator())
  trace.setGlobalTracerProvider(provider)
}
if (DSN) Sentry.init({ dsn: DSN,integrations: [Sentry.openTelemetryIntegration()] })

const tracer = trace.getTracer('homepage-2026')

// Adds attributes to the current request's span (no-op when telemetry is off).
export const setSpanAttributes = (attributes: Attributes) => trace.getActiveSpan()?.setAttributes(attributes)

async function reportResponse(name: string, res: Response) {
  if (res.status < 400 || !DSN) return
  const body = await res.clone().text()
  Sentry.captureMessage(`${name} ${res.status}`, { level: res.status >= 500 ? 'error' : 'warning', tags: { function: name, status: res.status }, extra: { body } })
}

export const withSentry = (name: string, handler: Handler): Handler =>
  !exporters.length && !DSN
    ? handler
    : async req => {
        const parent = propagation.extract(context.active(), Object.fromEntries(req.headers))
        return tracer.startActiveSpan(name, { attributes: { 'http.request.method': req.method, 'url.path': new URL(req.url).pathname } }, parent, async span => {
          try {
            const res = await handler(req)
            span.setAttribute('http.response.status_code', res.status)
            if (res.status >= 500) span.setStatus({ code: SpanStatusCode.ERROR })
            await reportResponse(name, res)
            return res
          } catch (err) {
            span.recordException(err as Error)
            span.setStatus({ code: SpanStatusCode.ERROR })
            if (DSN) Sentry.captureException(err, { tags: { function: name } })
            throw err
          } finally {
            span.end()
            await Promise.all([provider.forceFlush(), DSN && Sentry.flush(FLUSH_MS)])
          }
        })
      }
