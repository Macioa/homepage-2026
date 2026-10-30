// A harness run: the store and one abort signal for the user's stop or the timeout. Its model calls all
// go through callLoggedModel, so each one (retries included) is logged in the Gemini rate window (state/usage.ts) first.

import { callModel, ModelTimeoutError, type ModelRequest } from '../connections/gemini'
import { DataAccessError } from '../connections/supabase'
import type { AppDispatch, RootState } from '../state'
import { onNetworkError } from '../state/networkErrors'
import { logGeminiRequest, selectSendLocked } from '../state/usage'

const HARNESS_TIMEOUT_MS = 60_000
// Retries of a model call that timed out in Netlify or Gemini. The harness timeout still caps the run.
const LLM_TIMEOUT_RETRIES = 3

export type HarnessStore = { dispatch: AppDispatch; getState: () => RootState }

export type Run = { store: HarnessStore; signal: AbortSignal }

const withTimeout = (signal: AbortSignal) => AbortSignal.any([signal, AbortSignal.timeout(HARNESS_TIMEOUT_MS)])

export const createRun = (store: HarnessStore, signal: AbortSignal): Run => ({ store, signal: withTimeout(signal) })

// The log is a Supabase call, so a failed log is a failed Supabase connection.
async function logRequest({ store }: Run) {
  try {
    await store.dispatch(logGeminiRequest()).unwrap()
  } catch (error) {
    throw new DataAccessError((error as Error).message)
  }
}

// A timed-out call is retried while retries are left, the run is live and the rate window isn't locked.
const canRetry = (error: unknown, { store, signal }: Run, retriesLeft: number) =>
  error instanceof ModelTimeoutError && retriesLeft > 0 && !signal.aborted && !selectSendLocked(store.getState(), Date.now())

// Logs the call, then makes it; a failed log stops the call, so none goes uncounted.
async function callWithRetries(request: ModelRequest, run: Run, retriesLeft: number): ReturnType<typeof callModel> {
  await logRequest(run)
  try {
    return await callModel(request, run.signal, onNetworkError(run.store.dispatch))
  } catch (error) {
    if (!canRetry(error, run, retriesLeft)) throw error
    return callWithRetries(request, run, retriesLeft - 1)
  }
}

export const callLoggedModel = (request: ModelRequest, run: Run) => callWithRetries(request, run, LLM_TIMEOUT_RETRIES)
