// POST /api/chat { messages, tools?, toolChoice? } -> { message, text, toolCalls }, with the chat JWT as a Bearer
// token. One Gemini call; the tool loop runs in the browser (src/harness). Messages use LangChain's stored format.
// GEMINI_API_KEY stays on the server. Each call is first logged in the Gemini rate window as the caller, which checks
// their JWT (../supabase.ts); a full window is refused.
// Errors answered here are tagged { error, source, timeout } so the browser can tell them from Netlify's own
// (src/connections/gemini.ts): source 'gemini' for the model call, 'netlify' for the function's own work before it
// (the config, the token and rate window, reading the request and its messages and tools).

import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { mapStoredMessagesToChatMessages, type AIMessageChunk, type StoredMessage } from '@langchain/core/messages'
import { logGeminiRequest, SUPABASE_ENV, TokenRefusedError } from '../supabase.ts'
import { setSpanAttributes, withSentry } from '../sentry.ts'

const MODEL = 'gemini-3.1-flash-lite'
// No retries: LangChain would wait out a 429, so the usage limit would stall the run instead of reaching the browser.
const MAX_RETRIES = 0
const USAGE_LIMIT_STATUS = 429
// Gemini is overloaded ("high demand"); the browser waits and retries.
const UNAVAILABLE_STATUS = 503
const PASSED_THROUGH = [USAGE_LIMIT_STATUS, UNAVAILABLE_STATUS]
const ERROR_STATUS = 500
const TIMEOUT_STATUS = 504
// Under netlify dev's 30-second function limit, so a stalled Gemini call (or rate window log) is cancelled and
// answered here instead of the platform killing the function.
const GEMINI_TIMEOUT_MS = 20_000
const ENV = ['GEMINI_API_KEY', ...SUPABASE_ENV]
// The window's limit, the same USAGE_LIMIT the browser counts against (src/state/usage.ts).
const USAGE_LIMIT = 10
const UNAUTHORIZED_STATUS = 401

type ModelRequest = { messages: StoredMessage[]; tools?: Record<string, unknown>[]; toolChoice?: string }

type ErrorSource = 'gemini' | 'netlify'

// Built per call: the constructor throws without a key, which would crash the function at load.
const createModel = () => new ChatGoogleGenerativeAI({ model: MODEL, apiKey: process.env.GEMINI_API_KEY, maxRetries: MAX_RETRIES })

const timedOut = (signal: AbortSignal) => signal.reason?.name === 'TimeoutError'

// A timed-out call is a 504; Gemini's usage-limit 429 and overloaded 503 pass through; anything else is a 500.
function errorStatus(err: unknown, signal: AbortSignal) {
  if (timedOut(signal)) return TIMEOUT_STATUS
  const { status } = err as { status?: number }
  return status && PASSED_THROUGH.includes(status) ? status : ERROR_STATUS
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

// A refused token is a 401 and a timed-out log a 504; anything else is a 500.
const logErrorStatus = (err: Error, signal: AbortSignal) =>
  err instanceof TokenRefusedError ? UNAUTHORIZED_STATUS : timedOut(signal) ? TIMEOUT_STATUS : ERROR_STATUS

// Logs the call in the rate window as the caller. No token or a refused one is a 401, a window past USAGE_LIMIT
// a 429. Returns the refusal, if any.
async function refusal(req: Request, signal: AbortSignal) {
  const authorization = req.headers.get('authorization')
  if (!authorization) return errorResponse('no chat token', 'netlify', UNAUTHORIZED_STATUS)
  const calls = await logGeminiRequest(authorization, signal).catch((err: Error) => err)
  if (calls instanceof Error) return errorResponse(calls.message, 'netlify', logErrorStatus(calls, signal), timedOut(signal))
  if (calls > USAGE_LIMIT) return errorResponse('usage limit reached', 'netlify', USAGE_LIMIT_STATUS)
}

type Prepared = Awaited<ReturnType<typeof prepare>>

async function invoke({ model, messages }: Prepared, signal: AbortSignal) {
  const message = await model.invoke(messages, { signal })
  setSpanAttributes({
    'gen_ai.system': 'gemini',
    'gen_ai.request.model': MODEL,
    'gen_ai.usage.input_tokens': message.usage_metadata?.input_tokens ?? 0,
    'gen_ai.usage.output_tokens': message.usage_metadata?.output_tokens ?? 0,
    'gen_ai.response.tool_calls': message.tool_calls?.length ?? 0,
  })
  return toReply(message)
}

const handler = async (req: Request) => {
  const missing = ENV.filter(name => !process.env[name])
  if (missing.length) return errorResponse(`${missing.join(', ')} not set`, 'netlify', ERROR_STATUS)
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(GEMINI_TIMEOUT_MS)])
  const refused = await refusal(req, signal)
  if (refused) return refused
  const prepared = await prepare(req).catch((err: Error) => err)
  if (prepared instanceof Error) return errorResponse(prepared.message, 'netlify', ERROR_STATUS)
  try {
    return Response.json(await invoke(prepared, signal))
  } catch (err) {
    return errorResponse((err as Error).message, 'gemini', errorStatus(err, signal), timedOut(signal))
  }
}

export const config = { path: '/api/chat', method: 'POST' }

export default withSentry('chat', handler)
