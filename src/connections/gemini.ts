// One model call through the chat Netlify function (netlify/functions/chat.mts). Messages travel in
// LangChain's stored format, so the model's own messages (and their thought signatures) round-trip intact.
// Every failure is recorded with its source (networkError.ts): the function tags its own errors, so an
// untagged error response came from Netlify itself.

import { logNetworkError, since, type NetworkErrorKind, type OnNetworkError } from './networkError'

const ENDPOINT = '/api/chat'
const HEADERS = { 'Content-Type': 'application/json' }
// The chat function passes Gemini's 429 through when the usage limit is reached.
const USAGE_LIMIT_STATUS = 429
// The chat function passes Gemini's 503 through when the model is overloaded ("high demand").
const UNAVAILABLE_STATUS = 503
// Netlify answers 504 when it gives up on a function; netlify dev answers 500 with "TimeoutError: Task timed out".
// A 502 (the function crashed) is not a timeout, so it isn't retried.
const GATEWAY_TIMEOUT_STATUS = 504
const TIMED_OUT = /TimeoutError|timed out/i
const MAX_RESPONSE_DETAIL = 500

// Gemini refused the call: usage limit reached. The harness locks Send on it.
export class UsageLimitError extends Error {
  name = 'UsageLimitError'
}

// The Gemini call or the chat function ran out of time. The harness retries it (harness/run.ts).
export class ModelTimeoutError extends Error {
  name = 'ModelTimeoutError'
}

// Gemini is overloaded. The harness waits, then retries it (harness/run.ts).
export class ModelUnavailableError extends Error {
  name = 'ModelUnavailableError'
}

export type StoredMessage = { type: string; data: Record<string, unknown> }

export type ToolSpec = { type: 'function'; function: { name: string; description: string; parameters: unknown } }

export type ToolCall = { id: string; name: string; args: Record<string, unknown> }

export type ToolChoice = 'any' | 'auto' | 'none'

export type ModelRequest = { messages: StoredMessage[]; tools?: ToolSpec[]; toolChoice?: ToolChoice }

export type ModelReply = { message: StoredMessage; text: string; toolCalls: ToolCall[] }

// An error the chat function answered itself: source 'gemini' for the model call, 'netlify' for its own setup.
type TaggedError = { error?: string; source?: 'gemini' | 'netlify'; timeout?: boolean }

const parseJson = (text: string) => {
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

function failedKind(status: number, body: TaggedError, text: string): NetworkErrorKind {
  const timeout = body.source ? body.timeout : status === GATEWAY_TIMEOUT_STATUS || TIMED_OUT.test(text)
  return timeout ? 'timeout' : 'http'
}

function failedError(status: number, kind: NetworkErrorKind, message: string) {
  if (status === USAGE_LIMIT_STATUS) return new UsageLimitError(message)
  if (status === UNAVAILABLE_STATUS) return new ModelUnavailableError(message)
  return kind === 'timeout' ? new ModelTimeoutError(message) : new Error(message)
}

function failedResponse(res: Response, body: TaggedError, text: string, details: Record<string, unknown>) {
  const kind = failedKind(res.status, body, text)
  // Netlify's own error body stays in details.response; the chat shows only its status.
  const message = body.error ?? `chat ${res.status}`
  return { error: failedError(res.status, kind, message), kind, source: body.source ?? 'netlify', details: { ...details, response: text.slice(0, MAX_RESPONSE_DETAIL) } }
}

export async function callModel(request: ModelRequest, signal: AbortSignal, onError: OnNetworkError): Promise<ModelReply> {
  const start = Date.now()
  const details = { toolChoice: request.toolChoice ?? null, messages: request.messages.length }
  const res = await fetch(ENDPOINT, { method: 'POST', headers: HEADERS, body: JSON.stringify(request), signal }).catch((error: Error) => {
    if (signal.aborted) throw error
    throw logNetworkError(error, { source: 'netlify', kind: 'network', target: ENDPOINT, elapsedMs: since(start), details }, onError)
  })
  const text = await res.text()
  const body = parseJson(text)
  if (res.ok) return body
  const { error, ...failure } = failedResponse(res, body, text, details)
  throw logNetworkError(error, { ...failure, target: ENDPOINT, status: res.status, elapsedMs: since(start) }, onError)
}
