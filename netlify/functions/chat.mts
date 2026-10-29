// POST /api/chat { messages, tools?, toolChoice? } -> { message, text, toolCalls }. One Gemini call; the
// tool loop runs in the browser (src/harness). Messages use LangChain's stored format. GEMINI_API_KEY stays on the server.

import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { mapStoredMessagesToChatMessages, type AIMessageChunk, type StoredMessage } from '@langchain/core/messages'

const MODEL = 'gemini-3.1-flash-lite'

type ModelRequest = { messages: StoredMessage[]; tools?: Record<string, unknown>[]; toolChoice?: string }

// Built per call: the constructor throws without a key, which would crash the function at load.
const createModel = () => new ChatGoogleGenerativeAI({ model: MODEL, apiKey: process.env.GEMINI_API_KEY })

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
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}

export const config = { path: '/api/chat', method: 'POST' }
