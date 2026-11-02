// The chat function (functions/chat.mts), with Gemini and Supabase mocked. Kept out of netlify/functions, where
// Netlify would deploy it as a function. Each call is logged in the rate window with the caller's chat JWT first: no
// token or a refused one is a 401, a full window a 429, and Gemini is never called. Errors are tagged by source:
// 'netlify' for the config, token, window and reading the request (messages, tools), 'gemini' for the model call;
// a Gemini timeout is a 504, its usage limit a 429, its overload a 503.

import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import chat from './functions/chat.mts'

const { invoke, bindTools } = vi.hoisted(() => ({ invoke: vi.fn(), bindTools: vi.fn() }))

vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: class {
    invoke = invoke
    bindTools = bindTools
  }
}))

const human = { type: 'human', data: { content: 'hi' } }
const reply = { toDict: () => ({ type: 'ai', data: { content: 'ok' } }), text: 'ok', tool_calls: [] }

const BEARER = 'Bearer chat-jwt'
const headers = { Authorization: BEARER }
const post = (body: string, init: RequestInit = { headers }) => chat(new Request('http://localhost/api/chat', { method: 'POST', body, ...init }))
// The rate window's answer to log_gemini_request: `calls` calls in it, this one included.
const windowOf = (calls: number) => Response.json({ now: new Date().toISOString(), used: Array.from({ length: calls }, (_, id) => ({ id })) })
const supabase = vi.fn()
const send = (request: Record<string, unknown>) => post(JSON.stringify(request))
const answer = async (res: Response) => ({ status: res.status, body: await res.json() })

beforeEach(() => {
  vi.stubEnv('GEMINI_API_KEY', 'key')
  vi.stubEnv('VITE_SUPABASE_URL', 'https://db.test')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'publishable')
  vi.stubGlobal('fetch', supabase.mockReset().mockImplementation(async () => windowOf(1)))
  invoke.mockReset()
  bindTools.mockReset().mockReturnValue({ invoke })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

test('a reply from Gemini', async () => {
  invoke.mockResolvedValue(reply)
  expect(await answer(await send({ messages: [human] }))).toEqual({
    status: 200,
    body: { message: { type: 'ai', data: { content: 'ok' } }, text: 'ok', toolCalls: [] }
  })
})

test('tools are bound with the tool choice', async () => {
  invoke.mockResolvedValue(reply)
  const tools = [{ type: 'function', function: { name: 't', description: 'd', parameters: {} } }]
  await send({ messages: [human], tools, toolChoice: 'any' })
  expect(bindTools).toHaveBeenCalledWith(tools, { tool_choice: 'any' })
})

test('no key is netlify', async () => {
  vi.stubEnv('GEMINI_API_KEY', '')
  expect(await answer(await send({ messages: [human] }))).toEqual({
    status: 500,
    body: { error: 'GEMINI_API_KEY not set', source: 'netlify', timeout: false }
  })
})

test('a bad body, message or tool is netlify, and Gemini is never called', async () => {
  bindTools.mockImplementation(() => {
    throw new Error('bad tool')
  })
  const failures = [await post('{not json'), await send({ messages: [{ type: 'bogus', data: {} }] }), await send({ messages: [human], tools: [{}] })]
  for (const res of failures) expect(await answer(res)).toMatchObject({ status: 500, body: { source: 'netlify', timeout: false } })
  expect(invoke).not.toHaveBeenCalled()
})

test('a Gemini error is gemini', async () => {
  invoke.mockRejectedValue(new Error('bad request'))
  expect(await answer(await send({ messages: [human] }))).toEqual({ status: 500, body: { error: 'bad request', source: 'gemini', timeout: false } })
})

test("Gemini's usage-limit 429 passes through", async () => {
  invoke.mockRejectedValue(Object.assign(new Error('quota'), { status: 429 }))
  expect(await answer(await send({ messages: [human] }))).toEqual({ status: 429, body: { error: 'quota', source: 'gemini', timeout: false } })
})

test("Gemini's overloaded 503 passes through", async () => {
  invoke.mockRejectedValue(Object.assign(new Error('high demand'), { status: 503 }))
  expect(await answer(await send({ messages: [human] }))).toEqual({ status: 503, body: { error: 'high demand', source: 'gemini', timeout: false } })
})

test('other Gemini statuses stay a 500', async () => {
  invoke.mockRejectedValue(Object.assign(new Error('bad'), { status: 400 }))
  expect(await answer(await send({ messages: [human] }))).toMatchObject({ status: 500, body: { source: 'gemini' } })
})

test('a Gemini call past the time limit is a 504 timeout', async () => {
  // The time limit has already run out; the model call fails on the aborted signal.
  vi.spyOn(AbortSignal, 'timeout').mockReturnValue(AbortSignal.abort(new DOMException('timed out', 'TimeoutError')))
  invoke.mockImplementation(async (_messages: unknown, { signal }: { signal: AbortSignal }) => signal.throwIfAborted())
  expect(await answer(await send({ messages: [human] }))).toMatchObject({ status: 504, body: { source: 'gemini', timeout: true } })
})

test("the call is logged in the rate window with the caller's token", async () => {
  invoke.mockResolvedValue(reply)
  await send({ messages: [human] })
  expect(supabase).toHaveBeenCalledWith('https://db.test/rest/v1/rpc/log_gemini_request', expect.objectContaining({ method: 'POST' }))
  expect(supabase.mock.calls[0][1].headers).toMatchObject({ apikey: 'publishable', Authorization: BEARER })
})

test('no token is a 401, and neither the window nor Gemini is reached', async () => {
  expect(await answer(await post(JSON.stringify({ messages: [human] }), {}))).toEqual({
    status: 401,
    body: { error: 'no chat token', source: 'netlify', timeout: false }
  })
  expect(supabase).not.toHaveBeenCalled()
  expect(invoke).not.toHaveBeenCalled()
})

test('a token PostgREST refuses is a 401, and Gemini is never called', async () => {
  supabase.mockResolvedValue(Response.json({ message: 'JWSError JWSInvalidSignature' }, { status: 401 }))
  expect(await answer(await send({ messages: [human] }))).toEqual({
    status: 401,
    body: { error: 'JWSError JWSInvalidSignature', source: 'netlify', timeout: false }
  })
  expect(invoke).not.toHaveBeenCalled()
})

test('a window at the limit still calls Gemini; one past it is a 429', async () => {
  invoke.mockResolvedValue(reply)
  supabase.mockResolvedValueOnce(windowOf(10))
  expect((await send({ messages: [human] })).status).toBe(200)
  supabase.mockResolvedValueOnce(windowOf(11))
  expect(await answer(await send({ messages: [human] }))).toEqual({
    status: 429,
    body: { error: 'usage limit reached', source: 'netlify', timeout: false }
  })
  expect(invoke).toHaveBeenCalledTimes(1)
})

test('a failed window log is a netlify 500, and Gemini is never called', async () => {
  supabase.mockRejectedValue(new TypeError('fetch failed'))
  expect(await answer(await send({ messages: [human] }))).toEqual({ status: 500, body: { error: 'fetch failed', source: 'netlify', timeout: false } })
  expect(invoke).not.toHaveBeenCalled()
})

test('a window log past the time limit is a netlify 504 timeout, and Gemini is never called', async () => {
  vi.spyOn(AbortSignal, 'timeout').mockReturnValue(AbortSignal.abort(new DOMException('timed out', 'TimeoutError')))
  supabase.mockImplementation(async (_url: string, { signal }: RequestInit) => signal?.throwIfAborted())
  expect(await answer(await send({ messages: [human] }))).toMatchObject({ status: 504, body: { source: 'netlify', timeout: true } })
  expect(invoke).not.toHaveBeenCalled()
})
