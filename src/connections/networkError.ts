// Network error history, recorded on error: each connection takes an onError from its caller and calls it through
// logNetworkError where a request fails (state/networkErrors.ts builds it). Aborts (user stop, harness timeout) are not failures.

// netlify: the chat function or the platform around it failed (unreachable, crashed, killed at its time limit).
// gemini: the Gemini call inside the chat function failed. supabase: PostgREST or the token edge function could
// not be reached, or refused or failed the call. db_function: a Postgres function answered with an error.
export type NetworkErrorSource = 'netlify' | 'gemini' | 'supabase' | 'db_function'

// timeout: a time limit ran out. network: no response. http: an error response. config: env vars missing.
export type NetworkErrorKind = 'timeout' | 'network' | 'http' | 'config'

// status, elapsedMs and details are optional; state/networkErrors.ts fills their defaults.
export type NetworkErrorOptions = {
  source: NetworkErrorSource
  kind: NetworkErrorKind
  target: string // the endpoint, e.g. /api/chat or rest/v1/rpc/get_skill
  message: string
  status?: number | null
  elapsedMs?: number | null
  details?: Record<string, unknown>
}

export type OnNetworkError = (options: NetworkErrorOptions) => void

export const since = (start: number) => Date.now() - start

// Hands the error to onError and returns it, for `throw logNetworkError(error, options, onError)`.
export function logNetworkError<E extends Error>(error: E, options: Omit<NetworkErrorOptions, 'message'>, onError: OnNetworkError) {
  onError({ ...options, message: error.message })
  return error
}
