// One model call through the chat Netlify function (netlify/functions/chat.mts). Messages travel in
// LangChain's stored format, so the model's own messages (and their thought signatures) round-trip intact.

const ENDPOINT = '/api/chat'
const HEADERS = { 'Content-Type': 'application/json' }

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
  if (!res.ok) throw new Error(body.error ?? `chat ${res.status}`)
  return body
}
