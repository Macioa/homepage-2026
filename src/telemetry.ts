// Browser telemetry: Sentry errors and traces. Off when VITE_SENTRY_DSN is unset (tests, local dev).

import * as Sentry from '@sentry/react'

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined

export function initTelemetry() {
  if (!DSN) return
  Sentry.init({
    dsn: DSN,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1,    tracePropagationTargets: [/^\/api\//],
    propagateTraceparent: true, // W3C header, so the functions' OTel spans continue the browser's trace
  })}

export type UndeliveredReason = 'data_access' | 'usage_limit' | 'empty_reply' | 'other'

// A chat prompt whose reply never reached the visitor.
export function reportUndelivered(prompt: string, reason: UndeliveredReason, error?: unknown) {
  Sentry.withScope(scope => {
    scope.setTag('chat.undelivered', reason)
    scope.setContext('chat', { prompt })
    if (error instanceof Error) Sentry.captureException(error)
    else Sentry.captureMessage(`chat prompt undelivered: ${reason}`, 'warning')
  })
}
