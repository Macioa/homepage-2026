// POST /api/chat { messages, tools?, toolChoice? } -> { message, text, toolCalls }. One Gemini call; the
// tool loop runs in the browser (src/harness). Messages use LangChain's stored format. GEMINI_API_KEY stays on the server.
// Errors answered here are tagged { error, source, timeout } so the browser can tell them from Netlify's own
// (src/connections/gemini.ts): source 'gemini' for the model call, 'netlify' for the function's own work before it
// (the key, reading the request and its messages and tools).

import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { mapStoredMessagesToChatMessages, type AIMessageChunk, type StoredMessage } from '@langchain/core/messages'

const MODEL = 'gemini-3.1-flash-lite'
// No retries: LangChain would wait out a 429, so the usage limit would stall the run instead of reaching the browser.
const MAX_RETRIES = 0
const USAGE_LIMIT_STATUS = 429
const ERROR_STATUS = 500
const TIMEOUT_STATUS = 504
// Under netlify dev's 30-second function limit, so a stalled Gemini call is cancelled and answered here
// instead of the platform killing the function.
const GEMINI_TIMEOUT_MS = 20_000

type ModelRequest = { messages: StoredMessage[]; tools?: Record<string, unknown>[]; toolChoice?: string }

type ErrorSource = 'gemini' | 'netlify'

// Built per call: the constructor throws without a key, which would crash the function at load.
const createModel = () => new ChatGoogleGenerativeAI({ model: MODEL, apiKey: process.env.GEMINI_API_KEY, maxRetries: MAX_RETRIES })

const timedOut = (signal: AbortSignal) => signal.reason?.name === 'TimeoutError'

// A timed-out call is a 504; Gemini's usage-limit 429 passes through; anything else is a 500.
function errorStatus(err: unknown, signal: AbortSignal) {
  if (timedOut(signal)) return TIMEOUT_STATUS
  return (err as { status?: number }).status === USAGE_LIMIT_STATUS ? USAGE_LIMIT_STATUS : ERROR_STATUS
}

const errorResponse = (error: string, source: ErrorSource, status: number, timeout = false) => Response.json({ error, source, timeout }, { status })

const bindModel = ({ tools, toolChoice }: ModelRequest) =>
  tools?.length ? createModel().bindTools(tools, { tool_choice: toolChoice }) : createModel()

const toReply = (message: AIMessageChunk) => ({ message: message.toDict(), text: message.text, toolCalls: message.tool_calls ?? [] })

// The model and messages for the call. A bad body, message or tool throws here, before Gemini is reached.
async function prepare(req: Request) {
  const request = (await req.json()) as ModelRequest
  return { model: bindModel(request), messages: mapStoredMessagesToChatMessages(request.messages) }
}

type Prepared = Awaited<ReturnType<typeof prepare>>

async function invoke({ model, messages }: Prepared, signal: AbortSignal) {
  return toReply(await model.invoke(messages, { signal }))
}

export default async (req: Request) => {
  if (!process.env.GEMINI_API_KEY) return errorResponse('GEMINI_API_KEY not set', 'netlify', ERROR_STATUS)
  const prepared = await prepare(req).catch((err: Error) => err)
  if (prepared instanceof Error) return errorResponse(prepared.message, 'netlify', ERROR_STATUS)
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(GEMINI_TIMEOUT_MS)])
  try {
    return Response.json(await invoke(prepared, signal))
  } catch (err) {
    return errorResponse((err as Error).message, 'gemini', errorStatus(err, signal), timedOut(signal))
  }
}

export const config = { path: '/api/chat', method: 'POST' }
