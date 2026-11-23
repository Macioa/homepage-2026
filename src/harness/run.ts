// A harness run: the store, one abort signal for the user's stop, and events for the UI.
// Its model calls all go through
// callLoggedModel, so each one (retries included) rereads the Gemini rate window (state/usage.ts) and waits
// out a full one; the chat function logs the call in it.

import { callModel, ModelTimeoutError, ModelUnavailableError, type ModelProvider, type ModelRequest } from '../connections/gemini'
import { DataAccessError } from '../connections/supabase'
import { TOKEN_NOT_READY } from '../prompts'
import type { AppDispatch, RootState } from '../state'
import { onNetworkError } from '../state/networkErrors'
import { fetchGeminiUsage, selectActiveCalls, selectSendLocked, USAGE_LIMIT } from '../state/usage'

// Retries of a Gemini call that timed out or found Gemini overloaded: three requests in all, then the fallback.
const LLM_RETRIES = 2
// Serves the rest of the run once Gemini has failed three times. Gets one request per model call.
const FALLBACK_PROVIDER: ModelProvider = 'openrouter'
// An overloaded Gemini (503) is retried after this wait.
const UNAVAILABLE_WAIT_MS = 30_000
// Once the rate window is full, a model call waits until at least this many slots are free.
const FREE_SLOTS = 2

export type HarnessStore = { dispatch: AppDispatch; getState: () => RootState }

// What the UI hears about a run: a cooldown wait starting or ending, and the move to the fallback LLM.
export type RunEvents = { onCooldown: (cooling: boolean) => void; onFallback: () => void }

export type Run = { store: HarnessStore; signal: AbortSignal; events?: RunEvents; provider?: ModelProvider }

export const createRun = (store: HarnessStore, signal: AbortSignal, events?: RunEvents): Run => ({ store, signal, events })

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
  for (let at = slotsFreeAt(run); at; at = slotsFreeAt(run)) {
    run.events?.onCooldown(true)
    await sleep(at - Date.now(), run.signal)
  }
}

// The chat JWT the window read and the model call are made with.
function chatToken({ store }: Run) {
  const { token } = store.getState().auth
  if (!token) throw new DataAccessError(TOKEN_NOT_READY)
  return token
}

// The window is read from Supabase, so a failed read is a failed Supabase connection.
async function readWindow({ store }: Run) {
  try {
    await store.dispatch(fetchGeminiUsage()).unwrap()
  } catch (error) {
    throw new DataAccessError((error as Error).message)
  }
}

const retryable = (error: unknown) => error instanceof ModelTimeoutError || error instanceof ModelUnavailableError

// A timed-out or overloaded call can go again while the run is live and the rate window isn't locked.
const canCallAgain = (error: unknown, { store, signal }: Run) =>
  retryable(error) && !signal.aborted && !selectSendLocked(store.getState(), Date.now())

const withProvider = (request: ModelRequest, { provider }: Run) => (provider ? { ...request, provider } : request)

// Rereads the window and waits for free slots, then makes the call. An overloaded Gemini is given
// UNAVAILABLE_WAIT_MS before the retry. With no retries left, the run moves to the fallback provider.
async function callWithRetries(request: ModelRequest, run: Run, retriesLeft: number): ReturnType<typeof callModel> {
  const token = chatToken(run)
  // The fallback provider is outside the rate window.
  if (!run.provider) {
    await readWindow(run)
    await waitForSlots(run)
  }
  try {
    const reply = await callModel(withProvider(request, run), token, run.signal, onNetworkError(run.store.dispatch))
    run.events?.onCooldown(false)
    return reply
  } catch (error) {
    if (!canCallAgain(error, run)) throw error
    if (retriesLeft === 0) {
      if (run.provider) throw error
      run.provider = FALLBACK_PROVIDER
      run.events?.onCooldown(false)
      run.events?.onFallback()
      return callWithRetries(request, run, 0)
    }
    if (error instanceof ModelUnavailableError) {
      run.events?.onCooldown(true)
      await sleep(UNAVAILABLE_WAIT_MS, run.signal)
    }
    return callWithRetries(request, run, retriesLeft - 1)
  }
}

export const callLoggedModel = (request: ModelRequest, run: Run) => callWithRetries(request, run, run.provider ? 0 : LLM_RETRIES)
