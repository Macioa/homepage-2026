// Supabase for the chat function (functions/chat.mts): Postgres functions called through PostgREST with the
// caller's own Authorization header, so PostgREST checks their chat JWT just as it does for the browser's calls
// (src/connections/supabase.ts). Kept out of netlify/functions, where Netlify would deploy it as a function.

export const SUPABASE_ENV = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']
const AUTH_FAILURE_STATUSES = [401, 403]

// PostgREST refused the caller's JWT: forged, expired, or for a role that can't run the function.
export class TokenRefusedError extends Error {
  name = 'TokenRefusedError'
}

type RpcError = { message?: string }

// Calls a no-argument Postgres function as whoever `authorization` names.
async function callRpc<T>(fn: string, authorization: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '', Authorization: authorization },
    body: '{}',
    signal
  })
  const body = await res.json().catch(() => ({}))
  const message = (body as RpcError).message ?? `${fn} ${res.status}`
  if (AUTH_FAILURE_STATUSES.includes(res.status)) throw new TokenRefusedError(message)
  if (!res.ok) throw new Error(message)
  return body as T
}

// Logs one Gemini call in the shared rate window (public.log_gemini_request); resolves to the number of calls
// in the window, this one included.
export async function logGeminiRequest(authorization: string, signal: AbortSignal) {
  const { used } = await callRpc<{ used: unknown[] }>('log_gemini_request', authorization, signal)
  return used.length
}
