// @vitest-environment jsdom
// Connections record failed requests in networkErrorHistory where they fail, with their source: Netlify vs
// Gemini for the chat function, Supabase vs the db function for PostgREST. Aborts are not recorded. The
// history keeps the last 100.

import { afterEach, expect, test, vi } from 'vitest'
import { callModel, ModelTimeoutError, ModelUnavailableError, type ModelRequest } from '../connections/gemini'
import { store } from '.'
import { networkErrorHistoryReducer, onNetworkError, recordNetworkError, type NetworkErrorRecord } from './networkErrors'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const respond = (status: number, body: string) => vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status })))
const request: ModelRequest = { messages: [], toolChoice: 'any' }
const live = () => new AbortController().signal
const history = () => store.getState().networkErrorHistory
const latest = () => history().at(-1)
const onError = onNetworkError(store.dispatch)

test('an untagged timeout is Netlify: netlify dev kills the function with a 500', async () => {
  respond(500, 'TimeoutError: Task timed out after 30.00 seconds\n at ...')
  await expect(callModel(request, 'token', live(), onError)).rejects.toBeInstanceOf(ModelTimeoutError)
  expect(latest()).toMatchObject({ source: 'netlify', kind: 'timeout', target: '/api/chat', status: 500, message: 'chat 500' })
  expect(latest()?.details.response).toMatch(/^TimeoutError: Task timed out/)
})

test("Netlify's 504 is a timeout; its body is kept in details, not shown", async () => {
  respond(504, '{"errorMessage":"Task timed out after 10.00 seconds","errorType":"Sandbox.Timedout"}')
  await expect(callModel(request, 'token', live(), onError)).rejects.toThrow(new ModelTimeoutError('chat 504'))
  expect(latest()).toMatchObject({ source: 'netlify', kind: 'timeout', status: 504, message: 'chat 504' })
  expect(latest()?.details.response).toContain('Sandbox.Timedout')
})

test('a 502 (crashed function) is not a timeout, so it is not retried', async () => {
  respond(502, 'Bad Gateway')
  await expect(callModel(request, 'token', live(), onError)).rejects.not.toBeInstanceOf(ModelTimeoutError)
  expect(latest()).toMatchObject({ source: 'netlify', kind: 'http', status: 502, message: 'chat 502' })
})

test('a tagged timeout is Gemini, inside the function', async () => {
  respond(504, JSON.stringify({ error: 'aborted', source: 'gemini', timeout: true }))
  await expect(callModel(request, 'token', live(), onError)).rejects.toBeInstanceOf(ModelTimeoutError)
  expect(latest()).toMatchObject({ source: 'gemini', kind: 'timeout', status: 504, details: { toolChoice: 'any', messages: 0 } })
})

test('a tagged Gemini error is not a timeout', async () => {
  respond(500, JSON.stringify({ error: 'bad request', source: 'gemini', timeout: false }))
  await expect(callModel(request, 'token', live(), onError)).rejects.not.toBeInstanceOf(ModelTimeoutError)
  expect(latest()).toMatchObject({ source: 'gemini', kind: 'http', message: 'bad request' })
})

test("Gemini's overloaded 503 is unavailable, not a timeout, and recorded as Gemini", async () => {
  const error = '[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com: [503 Service Unavailable] high demand'
  respond(503, JSON.stringify({ error, source: 'gemini', timeout: false }))
  await expect(callModel(request, 'token', live(), onError)).rejects.toBeInstanceOf(ModelUnavailableError)
  expect(latest()).toMatchObject({ source: 'gemini', kind: 'http', status: 503, message: error })
})

test('an abort (deadline or user stop) is not recorded', async () => {
  vi.stubGlobal('fetch', vi.fn((_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)))))
  const before = history().length
  await expect(callModel(request, 'token', AbortSignal.timeout(1), onError)).rejects.toThrow()
  const stopped = new AbortController()
  const call = callModel(request, 'token', stopped.signal, onError)
  stopped.abort()
  await expect(call).rejects.toThrow()
  expect(history()).toHaveLength(before)
})

test('PostgREST: a 4xx is the db function, a 5xx is Supabase', async () => {
  // A fresh module reads the stubbed env.
  vi.stubEnv('VITE_SUPABASE_URL', 'https://db.test')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'key')
  vi.resetModules()
  const { callRpc } = await import('../connections/supabase')
  respond(400, JSON.stringify({ message: 'no such skill' }))
  await expect(callRpc('get_skill', { p_skill: 'x' }, 't', onError)).rejects.toThrow('no such skill')
  respond(503, JSON.stringify({ message: 'down' }))
  await expect(callRpc('get_skill', {}, 't', onError)).rejects.toThrow('down')
  expect(history().slice(-2)).toMatchObject([
    { source: 'db_function', target: 'rest/v1/rpc/get_skill', details: { args: { p_skill: 'x' }, response: { message: 'no such skill' } } },
    { source: 'supabase', message: 'down' }
  ])
})

test('one reducer for every record: defaults filled, last 100 kept', () => {
  const options = (n: number) => ({ source: 'supabase', kind: 'network', target: 't', message: `m${n}` }) as const
  const state = Array.from({ length: 105 }, (_, n) => n).reduce<NetworkErrorRecord[]>(
    (s, n) => networkErrorHistoryReducer(s, recordNetworkError(options(n))),
    []
  )
  expect(state).toHaveLength(100)
  expect(state[0]).toMatchObject({ message: 'm5', status: null, elapsedMs: null, details: {} })
  expect(state[99].message).toBe('m104')
})
