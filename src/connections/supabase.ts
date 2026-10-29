// Supabase: a 1-hour PostgREST JWT for the `chat` role, minted by the get-llm-token edge function
// (personal repo), so the browser never holds a permanent key.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

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

// Calls a Postgres function through PostgREST as whoever the token names (the chat role).
export async function callRpc(fn: string, args: Record<string, unknown>, token: string, signal?: AbortSignal) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY not set')
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
    body: JSON.stringify(args),
    signal
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.message ?? `${fn} ${res.status}`)
  return body
}
