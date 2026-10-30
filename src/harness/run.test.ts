// @vitest-environment jsdom
// callLoggedModel: a timed-out model call is retried up to 3 times, each retry logged in the rate window;
// no retry once the window is locked, and none for other errors.

import { beforeEach, expect, test, vi } from 'vitest'
import { callModel, ModelTimeoutError } from '../connections/gemini'
import { callLoggedModel, type HarnessStore } from './run'

vi.mock('../connections/gemini', async importOriginal => ({ ...(await importOriginal<object>()), callModel: vi.fn() }))

const reply = { message: { type: 'ai', data: {} }, text: 'ok', toolCalls: [] }
const request = { messages: [] }
let lockedUntil = 0
const dispatch = vi.fn(() => ({ unwrap: async () => {} }))
const store = { dispatch, getState: () => ({ usage: { used: [], lockedUntil } }) } as unknown as HarnessStore
const run = () => ({ store, signal: new AbortController().signal })
const model = vi.mocked(callModel)

beforeEach(() => {
  lockedUntil = 0
  dispatch.mockClear()
  model.mockReset()
})

test('retries a timeout and logs every attempt', async () => {
  model.mockRejectedValueOnce(new ModelTimeoutError('t')).mockRejectedValueOnce(new ModelTimeoutError('t')).mockResolvedValueOnce(reply)
  await expect(callLoggedModel(request, run())).resolves.toBe(reply)
  expect(model).toHaveBeenCalledTimes(3)
  expect(dispatch).toHaveBeenCalledTimes(3)
})

test('gives up after 3 retries', async () => {
  model.mockRejectedValue(new ModelTimeoutError('t'))
  await expect(callLoggedModel(request, run())).rejects.toBeInstanceOf(ModelTimeoutError)
  expect(model).toHaveBeenCalledTimes(4)
})

test('no retry once the rate window is locked', async () => {
  lockedUntil = Date.now() + 60_000
  model.mockRejectedValue(new ModelTimeoutError('t'))
  await expect(callLoggedModel(request, run())).rejects.toBeInstanceOf(ModelTimeoutError)
  expect(model).toHaveBeenCalledTimes(1)
})

test('no retry for other errors', async () => {
  model.mockRejectedValue(new Error('bad'))
  await expect(callLoggedModel(request, run())).rejects.toThrow('bad')
  expect(model).toHaveBeenCalledTimes(1)
})
