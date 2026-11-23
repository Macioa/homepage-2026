// POST /api/chat { messages, tools?, toolChoice?, provider? } -> { message, text, toolCalls }, with the chat JWT as a
// Bearer token. One model call through a provider adapter (../llm.ts, Gemini by default); the tool loop runs in the
// browser (src/harness). Messages use LangChain's stored format. API keys stay on the server. Every call checks the
// caller's JWT; a rate-limited provider's call does so by being logged in the shared rate window, which checks
// their JWT (../supabase.ts); a full window is refused.
// Errors answered here are tagged { error, source, timeout } so the browser can tell them from Netlify's own
// (src/connections/gemini.ts): the provider's name for the model call, 'netlify' for the function's own work before it
// (the config, the token and rate window, reading the request and its messages and tools).

import { mapStoredMessagesToChatMessages, type AIMessageChunk, type StoredMessage } from '@langchain/core/messages'
import { llmAdapter, type LlmAdapter, type ProviderName } from '../llm.ts'
import { logGeminiRequest, SUPABASE_ENV, TokenRefusedError, verifyChatToken } from '../supabase.ts'
import { setSpanAttributes, withSentry } from '../sentry.ts'

const USAGE_LIMIT_STATUS = 429
// The provider is overloaded ("high demand"); the browser waits and retries.
const UNAVAILABLE_STATUS = 503
const PASSED_THROUGH = [USAGE_LIMIT_STATUS, UNAVAILABLE_STATUS]
const ERROR_STATUS = 500
const TIMEOUT_STATUS = 504
// Under netlify dev's 30-second function limit, so a stalled model call (or rate window log) is cancelled and
// answered here instead of the platform killing the function.
const MODEL_TIMEOUT_MS = 20_000
// The window's limit, the same USAGE_LIMIT the browser counts against (src/state/usage.ts).
const USAGE_LIMIT = 10
const UNAUTHORIZED_STATUS = 401

type ModelRequest = { messages: StoredMessage[]; tools?: Record<string, unknown>[]; toolChoice?: string; provider?: string }

type ErrorSource = ProviderName | 'netlify'

// Built per call: the constructors throw without a key, which would crash the function at load.
const createModel = (adapter: LlmAdapter) => adapter.create(process.env[adapter.envKey] ?? '')

const timedOut = (signal: AbortSignal) => signal.reason?.name === 'TimeoutError'

// A timed-out call is a 504; the provider's usage-limit 429 and overloaded 503 pass through; anything else is a 500.
function errorStatus(err: unknown, signal: AbortSignal, adapter: LlmAdapter) {
  if (timedOut(signal)) return TIMEOUT_STATUS
  const status = adapter.status(err)
  return status && PASSED_THROUGH.includes(status) ? status : ERROR_STATUS
}

const errorResponse = (error: string, source: ErrorSource, status: number, timeout = false) => Response.json({ error, source, timeout }, { status })

function bindModel({ tools, toolChoice }: ModelRequest, adapter: LlmAdapter) {
  const model = createModel(adapter)
  return tools?.length ? model.bindTools!(tools, { tool_choice: toolChoice }) : model
}

const toReply = (message: AIMessageChunk) => ({ message: message.toDict(), text: message.text, toolCalls: message.tool_calls ?? [] })

// The request and its adapter. A bad body or unknown provider throws here, before anything is logged.
async function readRequest(req: Request) {
  const request = (await req.json()) as ModelRequest
  return { request, adapter: llmAdapter(request.provider) }
}

// The model and messages for the call. A bad message or tool throws here, before the provider is reached.
const prepare = async (request: ModelRequest, adapter: LlmAdapter) => ({
  model: bindModel(request, adapter),
  messages: mapStoredMessagesToChatMessages(request.messages)
})

// A refused token is a 401 and a timed-out log a 504; anything else is a 500.
const logErrorStatus = (err: Error, signal: AbortSignal) =>
  err instanceof TokenRefusedError ? UNAUTHORIZED_STATUS : timedOut(signal) ? TIMEOUT_STATUS : ERROR_STATUS

// Admits the call as the caller, logging it in the rate window if its provider counts there. No token or a refused
// one is a 401, a window past USAGE_LIMIT a 429. Returns the refusal, if any.
async function refusal(req: Request, adapter: LlmAdapter, signal: AbortSignal) {
  const authorization = req.headers.get('authorization')
  if (!authorization) return errorResponse('no chat token', 'netlify', UNAUTHORIZED_STATUS)
  const admit = adapter.rateLimited ? logGeminiRequest : verifyChatToken
  const calls = await admit(authorization, signal).catch((err: Error) => err)
  if (calls instanceof Error) return errorResponse(calls.message, 'netlify', logErrorStatus(calls, signal), timedOut(signal))
  if (calls > USAGE_LIMIT) return errorResponse('usage limit reached', 'netlify', USAGE_LIMIT_STATUS)
}

type Prepared = Awaited<ReturnType<typeof prepare>>

async function invoke({ model, messages }: Prepared, adapter: LlmAdapter, signal: AbortSignal) {
  const message = (await model.invoke(messages, { signal })) as AIMessageChunk
  setSpanAttributes({
    'gen_ai.system': adapter.name,
    'gen_ai.request.model': adapter.model,
    'gen_ai.usage.input_tokens': message.usage_metadata?.input_tokens ?? 0,
    'gen_ai.usage.output_tokens': message.usage_metadata?.output_tokens ?? 0,
    'gen_ai.response.tool_calls': message.tool_calls?.length ?? 0,
  })
  return toReply(message)
}

const handler = async (req: Request) => {
  const read = await readRequest(req).catch((err: Error) => err)
  if (read instanceof Error) return errorResponse(read.message, 'netlify', ERROR_STATUS)
  const { request, adapter } = read
  const missing = [adapter.envKey, ...SUPABASE_ENV].filter(name => !process.env[name])
  if (missing.length) return errorResponse(`${missing.join(', ')} not set`, 'netlify', ERROR_STATUS)
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(MODEL_TIMEOUT_MS)])
  const refused = await refusal(req, adapter, signal)
  if (refused) return refused
  const prepared = await prepare(request, adapter).catch((err: Error) => err)
  if (prepared instanceof Error) return errorResponse(prepared.message, 'netlify', ERROR_STATUS)
  try {
    return Response.json(await invoke(prepared, adapter, signal))
  } catch (err) {
    return errorResponse((err as Error).message, adapter.name, errorStatus(err, signal, adapter), timedOut(signal))
  }
}

export const config = { path: '/api/chat', method: 'POST' }

export default withSentry('chat', handler)
