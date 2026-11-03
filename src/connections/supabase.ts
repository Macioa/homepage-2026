// Supabase: a 1-hour PostgREST JWT for the `chat` role, minted by the get-jwt edge function
// (personal repo) behind the /api/get-jwt proxy (netlify/functions/get-jwt.mts), so the browser never holds a permanent key. Every failure is recorded where it happens (networkError.ts).

import { logNetworkError, since, type OnNetworkError } from './networkError'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const ENV_NOT_SET = 'VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY not set'
const TOKEN_TARGET = '/api/get-jwt'
// Statuses that mean Supabase itself failed (auth refused, server error), not the call's args.
const AUTH_FAILURE_STATUSES = [401, 403]
const SERVER_ERROR_STATUS = 500

// Supabase could not be reached or refused the connection. The harness aborts the run on it.
export class DataAccessError extends Error {
  name = 'DataAccessError'
}

const isConnectionFailure = (status: number) => AUTH_FAILURE_STATUSES.includes(status) || status >= SERVER_ERROR_STATUS

const rpcTarget = (fn: string) => `rest/v1/rpc/${fn}`

export type ChatToken = { token: string; expires_at: number } // expires_at: unix seconds

export async function getChatToken(onError: OnNetworkError): Promise<ChatToken> {
  const start = Date.now()
  const res = await fetch(TOKEN_TARGET, { method: 'POST' }).catch((error: Error) => {
    throw logNetworkError(error, { source: 'netlify', kind: 'network', target: TOKEN_TARGET, elapsedMs: since(start) }, onError)
  })
  const body = await res.json().catch(() => ({}))
  const failure = { target: TOKEN_TARGET, status: res.status, elapsedMs: since(start), details: { response: body } }
  if (!res.ok) throw logNetworkError(new Error(body.error ?? `get-jwt ${res.status}`), { source: 'netlify', kind: 'http', ...failure }, onError)
  return body as ChatToken
}

// A network failure is a DataAccessError; an abort (user stop or timeout) stays an abort.
async function fetchRpc(fn: string, args: Record<string, unknown>, token: string, onError: OnNetworkError, signal?: AbortSignal) {
  const start = Date.now()
  try {
    return await fetch(`${SUPABASE_URL}/${rpcTarget(fn)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
      body: JSON.stringify(args),
      signal
    })
  } catch (error) {
    if (signal?.aborted) throw error
    const failure = { target: rpcTarget(fn), elapsedMs: since(start), details: { args } }
    throw logNetworkError(new DataAccessError((error as Error).message), { source: 'supabase', kind: 'network', ...failure }, onError)
  }
}

// Calls a Postgres function through PostgREST as whoever the token names (the chat role). Connection
// failures throw DataAccessError; any other error response (e.g. bad args) is the function's and throws a plain Error.
export async function callRpc(fn: string, args: Record<string, unknown>, token: string, onError: OnNetworkError, signal?: AbortSignal) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw logNetworkError(new DataAccessError(ENV_NOT_SET), { source: 'supabase', kind: 'config', target: rpcTarget(fn) }, onError)
  const start = Date.now()
  const res = await fetchRpc(fn, args, token, onError, signal)
  const body = await res.json().catch(() => null)
  const failure = { kind: 'http', target: rpcTarget(fn), status: res.status, elapsedMs: since(start), details: { args, response: body } } as const
  if (isConnectionFailure(res.status)) throw logNetworkError(new DataAccessError(body?.message ?? `${fn} ${res.status}`), { source: 'supabase', ...failure }, onError)
  if (!res.ok) throw logNetworkError(new Error(body?.message ?? `${fn} ${res.status}`), { source: 'db_function', ...failure }, onError)
  return body
}
