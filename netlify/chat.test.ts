// The chat function (functions/chat.mts), with Gemini mocked. Kept out of netlify/functions, where Netlify would
// deploy it as a function. Errors are tagged by source: 'netlify' for the key and reading the request (messages,
// tools), 'gemini' for the model call; a Gemini timeout is a 504, its usage limit a 429.

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

const post = (body: string) => chat(new Request('http://localhost/api/chat', { method: 'POST', body }))
const send = (request: Record<string, unknown>) => post(JSON.stringify(request))
const answer = async (res: Response) => ({ status: res.status, body: await res.json() })

beforeEach(() => {
  vi.stubEnv('GEMINI_API_KEY', 'key')
  invoke.mockReset()
  bindTools.mockReset().mockReturnValue({ invoke })
})

afterEach(() => {
  vi.unstubAllEnvs()
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

test('a Gemini call past the time limit is a 504 timeout', async () => {
  // The time limit has already run out; the model call fails on the aborted signal.
  vi.spyOn(AbortSignal, 'timeout').mockReturnValue(AbortSignal.abort(new DOMException('timed out', 'TimeoutError')))
  invoke.mockImplementation(async (_messages: unknown, { signal }: { signal: AbortSignal }) => signal.throwIfAborted())
  expect(await answer(await send({ messages: [human] }))).toMatchObject({ status: 504, body: { source: 'gemini', timeout: true } })
})
