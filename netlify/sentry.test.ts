// Telemetry soft fail: with Sentry and Grafana both pointed at dead endpoints, a wrapped function still answers
// as it would without telemetry, and promptly.

import { beforeAll, describe, expect, it, vi } from 'vitest'

let withSentry: typeof import('./sentry.ts').withSentry

beforeAll(async () => {
  vi.stubEnv('SENTRY_DSN', 'http://public@127.0.0.1:9/1')
  vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://127.0.0.1:9/otlp')
  vi.stubEnv('OTEL_EXPORTER_OTLP_HEADERS', 'Authorization=Basic%20bad')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  ;({ withSentry } = await import('./sentry.ts'))
})

const req = () => new Request('http://localhost/api/test', { method: 'POST' })

describe('withSentry soft fail', () => {
  it('returns the handler response when both backends are unreachable', async () => {
    const started = Date.now()
    const res = await withSentry('test', async () => Response.json({ ok: true }))(req())
    expect(await res.json()).toEqual({ ok: true })
    expect(Date.now() - started).toBeLessThan(3_000)
  })

  it('passes error responses through unchanged', async () => {
    const res = await withSentry('test', async () => Response.json({ error: 'x' }, { status: 500 }))(req())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'x' })
  })

  it('rethrows the handler error, not a telemetry one, and runs the handler once', async () => {
    const handler = vi.fn(async () => {
      throw new Error('handler broke')
    })
    await expect(withSentry('test', handler)(req())).rejects.toThrow('handler broke')
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
