// A harness run: the store and one abort signal for the user's stop or the timeout. Its model calls all
// go through callLoggedModel, so each one is logged in the Gemini rate window (state/usage.ts) first.

import { callModel, type ModelRequest } from '../connections/gemini'
import { DataAccessError } from '../connections/supabase'
import type { AppDispatch, RootState } from '../state'
import { logGeminiRequest } from '../state/usage'

const HARNESS_TIMEOUT_MS = 60_000

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

// Logs the call, then makes it; a failed log stops the call, so none goes uncounted.
export async function callLoggedModel(request: ModelRequest, run: Run) {
  await logRequest(run)
  return callModel(request, run.signal)
}
