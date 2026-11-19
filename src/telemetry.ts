// Browser telemetry: Sentry errors and traces. Off when VITE_SENTRY_DSN is unset (tests, local dev).
// Soft fail: a failed init or report is logged and skipped, never thrown into the app.

import * as Sentry from '@sentry/react'
import { persistedFlag } from './state/urlFlags'

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined

function safely(what: string, fn: () => void) {
  try {
    fn()
  } catch (err) {
    console.warn(`telemetry: ${what} failed`, err)
  }
}

// Owner opt-out: visit any page with ?notelemetry once to set this cookie (?telemetry clears it).
const OPT_OUT_COOKIE = 'notelemetry'
// The intro's "send error reports" checkbox, remembered per browser.
const PREF_KEY = 'errorReports'

function ownerOptedOut() {
  const params = new URLSearchParams(location.search)
  if (params.has('notelemetry')) document.cookie = `${OPT_OUT_COOKIE}=1; max-age=315360000; path=/; samesite=lax`
  if (params.has('telemetry')) document.cookie = `${OPT_OUT_COOKIE}=; max-age=0; path=/`
  return document.cookie.split('; ').includes(`${OPT_OUT_COOKIE}=1`)
}

// ?error_reports=true|false sets the same remembered choice.
export const errorReportsEnabled = () => persistedFlag('error_reports', PREF_KEY, 'on', 'off', true)

// Saves the visitor's choice; turning it off stops Sentry for this page load too.
export function setErrorReports(on: boolean) {
  try {
    localStorage.setItem(PREF_KEY, on ? 'on' : 'off')
  } catch {}
  if (!on) safely('close', () => void Sentry.close())
}

// Tags events with a salted hash of the visitor's IP (from /api/visitor), never the IP itself.
const tagVisitor = () =>
  fetch('/api/visitor')
    .then(res => res.json())
    .then(({ id }) => id && Sentry.setUser({ id }))
    .catch(err => console.warn('telemetry: visitor id failed', err))

export function initTelemetry() {
  if (!DSN || ownerOptedOut() || !errorReportsEnabled()) return
  safely('init', () => {
    Sentry.init({
      dsn: DSN,
      integrations: [Sentry.browserTracingIntegration()],
      tracesSampleRate: 1, // every visit; traffic is low enough to keep all of it
      tracePropagationTargets: [/^\/api\//],
      propagateTraceparent: true, // W3C header, so the functions' OTel spans continue the browser's trace
    })
    tagVisitor()
  })
}

export type UndeliveredReason = 'data_access' | 'usage_limit' | 'empty_reply' | 'other'

// A chat prompt whose reply never reached the visitor.
export function reportUndelivered(prompt: string, reason: UndeliveredReason, error?: unknown) {
  safely('report', () =>
    Sentry.withScope(scope => {
      scope.setTag('chat.undelivered', reason)
      scope.setContext('chat', { prompt })
      if (error instanceof Error) Sentry.captureException(error)
      else Sentry.captureMessage(`chat prompt undelivered: ${reason}`, 'warning')
    })
  )
}
