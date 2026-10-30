// Supabase: a 1-hour PostgREST JWT for the `chat` role, minted by the get-llm-token edge function
// (personal repo), so the browser never holds a permanent key.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
// Statuses that mean Supabase itself failed (auth refused, server error), not the call's args.
const AUTH_FAILURE_STATUSES = [401, 403]
const SERVER_ERROR_STATUS = 500

// Supabase could not be reached or refused the connection. The harness aborts the run on it.
export class DataAccessError extends Error {
  name = 'DataAccessError'
}

const isConnectionFailure = (status: number) => AUTH_FAILURE_STATUSES.includes(status) || status >= SERVER_ERROR_STATUS

export type ChatToken = { token: string; expires_at: number } // expires_at: unix seconds

export async function getChatToken(): Promise<ChatToken> {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY not set')
  const res = await fetch(`${SUPABASE_URL}/functions/v1/get-llm-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    body: JSON.stringify({ role: 'chat' })
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `get-llm-token ${res.status}`)
  return body as ChatToken
}

// A network failure is a DataAccessError; an abort (user stop or timeout) stays an abort.
async function fetchRpc(fn: string, args: Record<string, unknown>, token: string, signal?: AbortSignal) {
  try {
    return await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
      body: JSON.stringify(args),
      signal
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new DataAccessError((error as Error).message)
  }
}

// Calls a Postgres function through PostgREST as whoever the token names (the chat role). Connection
// failures throw DataAccessError; any other error response (e.g. bad args) throws a plain Error.
export async function callRpc(fn: string, args: Record<string, unknown>, token: string, signal?: AbortSignal) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new DataAccessError('VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY not set')
  const res = await fetchRpc(fn, args, token, signal)
  const body = await res.json().catch(() => null)
  if (isConnectionFailure(res.status)) throw new DataAccessError(body?.message ?? `${fn} ${res.status}`)
  if (!res.ok) throw new Error(body?.message ?? `${fn} ${res.status}`)
  return body
}
