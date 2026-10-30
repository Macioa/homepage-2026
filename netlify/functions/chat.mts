// POST /api/chat { messages, tools?, toolChoice? } -> { message, text, toolCalls }. One Gemini call; the
// tool loop runs in the browser (src/harness). Messages use LangChain's stored format. GEMINI_API_KEY stays on the server.

import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { mapStoredMessagesToChatMessages, type AIMessageChunk, type StoredMessage } from '@langchain/core/messages'

const MODEL = 'gemini-3.1-flash-lite'
// No retries: LangChain would wait out a 429, so the usage limit would stall the run instead of reaching the browser.
const MAX_RETRIES = 0
const USAGE_LIMIT_STATUS = 429
const ERROR_STATUS = 500

type ModelRequest = { messages: StoredMessage[]; tools?: Record<string, unknown>[]; toolChoice?: string }

// Built per call: the constructor throws without a key, which would crash the function at load.
const createModel = () => new ChatGoogleGenerativeAI({ model: MODEL, apiKey: process.env.GEMINI_API_KEY, maxRetries: MAX_RETRIES })

// Gemini's usage-limit 429 passes through; anything else is a 500.
const errorStatus = (err: unknown) => ((err as { status?: number }).status === USAGE_LIMIT_STATUS ? USAGE_LIMIT_STATUS : ERROR_STATUS)

const bindModel = ({ tools, toolChoice }: ModelRequest) =>
  tools?.length ? createModel().bindTools(tools, { tool_choice: toolChoice }) : createModel()

const toReply = (message: AIMessageChunk) => ({ message: message.toDict(), text: message.text, toolCalls: message.tool_calls ?? [] })

async function invoke(request: ModelRequest, signal: AbortSignal) {
  const message = await bindModel(request).invoke(mapStoredMessagesToChatMessages(request.messages), { signal })
  return toReply(message)
}

export default async (req: Request) => {
  if (!process.env.GEMINI_API_KEY) return Response.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 })
  try {
    return Response.json(await invoke((await req.json()) as ModelRequest, req.signal))
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: errorStatus(err) })
  }
}

export const config = { path: '/api/chat', method: 'POST' }
