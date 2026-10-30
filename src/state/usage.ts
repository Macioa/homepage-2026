// Gemini rate window: a sliding window log in Supabase (public.gemini_requests, personal repo). Every
// model call is logged first; the site has no login, so all visitors share one window. Gemini allows 15
// calls a minute; the app counts against 10 and locks Send for 30 seconds from any call that reaches 10.

import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { callRpc } from '../connections/supabase'
import { TOKEN_NOT_READY } from '../prompts'

export const USAGE_LIMIT = 10
const LOCK_MS = 30_000
const POLL_MS = 5_000

// What log_gemini_request / get_gemini_usage return: server time and the calls still in the window.
type UsageRow = { id: number; sent_at: string; expires_at: string }
type UsageSnapshot = { now: string; used: UsageRow[] }

// One call in the window, in client-clock ms (shifted by the server's clock offset).
export type UsedCall = { id: number; sentAt: number; expiresAt: number }

export type UsageState = {
  used: UsedCall[] // oldest first
  lockedUntil: number // client ms; Send is locked while now is before it
}

type UsageRoot = { auth: { token: string | null }; usage: UsageState }
type UsageOnly = Pick<UsageRoot, 'usage'>

const initialState: UsageState = { used: [], lockedUntil: 0 }

function toUsedCalls({ now, used }: UsageSnapshot, receivedAt: number): UsedCall[] {
  const offset = receivedAt - Date.parse(now)
  return used.map(({ id, sent_at, expires_at }) => ({ id, sentAt: Date.parse(sent_at) + offset, expiresAt: Date.parse(expires_at) + offset }))
}

async function readWindow(fn: string, token: string | null) {
  if (!token) throw new Error(TOKEN_NOT_READY)
  const snapshot: UsageSnapshot = await callRpc(fn, {}, token)
  const receivedAt = Date.now()
  return { receivedAt, used: toUsedCalls(snapshot, receivedAt) }
}

const usageThunk = createAsyncThunk.withTypes<{ state: UsageRoot }>()

// Logs one Gemini call; resolves to the window after it.
export const logGeminiRequest = usageThunk('usage/log', (_: void, { getState }) => readWindow('log_gemini_request', getState().auth.token))

// Reads the window (other visitors' calls included). Skipped until the chat JWT is in.
export const fetchGeminiUsage = usageThunk('usage/fetch', (_: void, { getState }) => readWindow('get_gemini_usage', getState().auth.token), {
  condition: (_, { getState }) => Boolean(getState().auth.token)
})

// Calls only ever leave the window by expiring, so snapshots merge by id; a late poll can't drop a newer log.
function mergeCalls(held: UsedCall[], incoming: UsedCall[], receivedAt: number) {
  const byId = new Map([...held, ...incoming].map(call => [call.id, call]))
  return [...byId.values()].filter(({ expiresAt }) => expiresAt > receivedAt).sort((a, b) => a.sentAt - b.sentAt)
}

// Calls in the window at the moment `call` was sent, itself included.
const windowAt = (used: UsedCall[], call: UsedCall) => used.filter(({ sentAt, expiresAt }) => sentAt <= call.sentAt && expiresAt > call.sentAt).length

// The lock runs LOCK_MS from the latest call that brought the window to USAGE_LIMIT.
const lockFrom = (used: UsedCall[]) =>
  used.reduce((until, call) => (windowAt(used, call) >= USAGE_LIMIT ? Math.max(until, call.sentAt + LOCK_MS) : until), 0)

const usage = createSlice({
  name: 'usage',
  initialState,
  reducers: {
    // Locks Send for LOCK_MS from now: Gemini refused a call for its usage limit.
    lockSend: {
      reducer: (state, { payload }: PayloadAction<number>) => {
        state.lockedUntil = Math.max(state.lockedUntil, payload)
      },
      prepare: () => ({ payload: Date.now() + LOCK_MS })
    }
  },
  extraReducers: builder => {
    builder.addMatcher(
      ({ type }) => type === logGeminiRequest.fulfilled.type || type === fetchGeminiUsage.fulfilled.type,
      (state, { payload }: { payload: { receivedAt: number; used: UsedCall[] } }) => {
        state.used = mergeCalls(state.used, payload.used, payload.receivedAt)
        state.lockedUntil = Math.max(state.lockedUntil, lockFrom(state.used))
      }
    )
  }
})

export const { lockSend } = usage.actions
export const usageReducer = usage.reducer

// Calls not yet expired at `now`.
export const selectActiveCalls = ({ usage }: UsageOnly, now: number) => usage.used.filter(({ expiresAt }) => expiresAt > now)

export const selectSendLocked = ({ usage }: UsageOnly, now: number) => now < usage.lockedUntil

type UsageStore = {
  dispatch: (action: ReturnType<typeof fetchGeminiUsage>) => unknown
  getState: () => UsageRoot
  subscribe: (listener: () => void) => () => void
}

// Reads the shared window on page load, the moment the first chat JWT is in, then polls it while the
// tab is visible. Returns a stop function.
export function startUsagePolling({ dispatch, getState, subscribe }: UsageStore) {
  const poll = () => {
    if (!document.hidden) dispatch(fetchGeminiUsage())
  }
  const unsubscribe = subscribe(() => {
    if (!getState().auth.token) return
    unsubscribe()
    dispatch(fetchGeminiUsage())
  })
  const timer = setInterval(poll, POLL_MS)
  return () => {
    unsubscribe()
    clearInterval(timer)
  }
}
