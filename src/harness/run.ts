// A harness run: the store and one abort signal for the user's stop. Its model calls all go through
// callLoggedModel, so each one (retries included) waits out a full rate window, then is logged in the
// Gemini rate window (state/usage.ts) first.

import { callModel, ModelTimeoutError, ModelUnavailableError, type ModelRequest } from '../connections/gemini'
import { DataAccessError } from '../connections/supabase'
import type { AppDispatch, RootState } from '../state'
import { onNetworkError } from '../state/networkErrors'
import { logGeminiRequest, selectActiveCalls, selectSendLocked, USAGE_LIMIT } from '../state/usage'

// Retries of a model call that timed out in Netlify or Gemini, or found Gemini overloaded.
const LLM_RETRIES = 3
// An overloaded Gemini (503) is retried after this wait.
const UNAVAILABLE_WAIT_MS = 30_000
// Once the rate window is full, a model call waits until at least this many slots are free.
const FREE_SLOTS = 2

export type HarnessStore = { dispatch: AppDispatch; getState: () => RootState }

export type Run = { store: HarnessStore; signal: AbortSignal }

export const createRun = (store: HarnessStore, signal: AbortSignal): Run => ({ store, signal })

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    signal.throwIfAborted()
    const done = () => {
      signal.removeEventListener('abort', abort)
      resolve()
    }
    const abort = () => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', abort, { once: true })
  })

// When FREE_SLOTS slots will be free if the window is full now; 0 if it isn't full.
function slotsFreeAt({ store }: Run) {
  const expiries = selectActiveCalls(store.getState(), Date.now()).map(({ expiresAt }) => expiresAt).sort((a, b) => a - b)
  return expiries.length < USAGE_LIMIT ? 0 : expiries[expiries.length - USAGE_LIMIT + FREE_SLOTS - 1]
}

// Rechecks after each wait: other visitors' calls may have filled the window meanwhile.
async function waitForSlots(run: Run) {
  for (let at = slotsFreeAt(run); at; at = slotsFreeAt(run)) await sleep(at - Date.now(), run.signal)
}

// The log is a Supabase call, so a failed log is a failed Supabase connection.
async function logRequest({ store }: Run) {
  try {
    await store.dispatch(logGeminiRequest()).unwrap()
  } catch (error) {
    throw new DataAccessError((error as Error).message)
  }
}

const retryable = (error: unknown) => error instanceof ModelTimeoutError || error instanceof ModelUnavailableError

// A timed-out or overloaded call is retried while retries are left, the run is live and the rate window isn't locked.
const canRetry = (error: unknown, { store, signal }: Run, retriesLeft: number) =>
  retryable(error) && retriesLeft > 0 && !signal.aborted && !selectSendLocked(store.getState(), Date.now())

// Waits for free slots, logs the call, then makes it; a failed log stops the call, so none goes uncounted.
// An overloaded Gemini is given UNAVAILABLE_WAIT_MS before the retry.
async function callWithRetries(request: ModelRequest, run: Run, retriesLeft: number): ReturnType<typeof callModel> {
  await waitForSlots(run)
  await logRequest(run)
  try {
    return await callModel(request, run.signal, onNetworkError(run.store.dispatch))
  } catch (error) {
    if (!canRetry(error, run, retriesLeft)) throw error
    if (error instanceof ModelUnavailableError) await sleep(UNAVAILABLE_WAIT_MS, run.signal)
    return callWithRetries(request, run, retriesLeft - 1)
  }
}

export const callLoggedModel = (request: ModelRequest, run: Run) => callWithRetries(request, run, LLM_RETRIES)
