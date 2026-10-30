// One model call through the chat Netlify function (netlify/functions/chat.mts). Messages travel in
// LangChain's stored format, so the model's own messages (and their thought signatures) round-trip intact.

const ENDPOINT = '/api/chat'
const HEADERS = { 'Content-Type': 'application/json' }
// The chat function passes Gemini's 429 through when the usage limit is reached.
const USAGE_LIMIT_STATUS = 429

// Gemini refused the call: usage limit reached. The harness locks Send on it.
export class UsageLimitError extends Error {
  name = 'UsageLimitError'
}

export type StoredMessage = { type: string; data: Record<string, unknown> }

export type ToolSpec = { type: 'function'; function: { name: string; description: string; parameters: unknown } }

export type ToolCall = { id: string; name: string; args: Record<string, unknown> }

export type ToolChoice = 'any' | 'auto' | 'none'

export type ModelRequest = { messages: StoredMessage[]; tools?: ToolSpec[]; toolChoice?: ToolChoice }

export type ModelReply = { message: StoredMessage; text: string; toolCalls: ToolCall[] }

const readBody = (res: Response) => res.json().catch(() => ({}))

export async function callModel(request: ModelRequest, signal: AbortSignal): Promise<ModelReply> {
  const res = await fetch(ENDPOINT, { method: 'POST', headers: HEADERS, body: JSON.stringify(request), signal })
  const body = await readBody(res)
  if (res.status === USAGE_LIMIT_STATUS) throw new UsageLimitError(body.error ?? `chat ${res.status}`)
  if (!res.ok) throw new Error(body.error ?? `chat ${res.status}`)
  return body
}
