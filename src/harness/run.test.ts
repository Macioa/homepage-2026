// @vitest-environment jsdom
// callLoggedModel: a timed-out model call is retried up to 3 times, each retry rereading the rate window first;
// no retry once the window is locked, and none for other errors. An overloaded Gemini (503) is retried the
// same way after a 30 second wait. Once the window is full a call waits until 2 slots are free. createRun
// adds no timeout to the run's signal.

import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { callModel, ModelTimeoutError, ModelUnavailableError } from '../connections/gemini'
import { DataAccessError } from '../connections/supabase'
import { USAGE_LIMIT, type UsedCall } from '../state/usage'
import { callLoggedModel, createRun, type HarnessStore } from './run'

vi.mock('../connections/gemini', async importOriginal => ({ ...(await importOriginal<object>()), callModel: vi.fn() }))

const reply = { message: { type: 'ai', data: {} }, text: 'ok', toolCalls: [] }
const request = { messages: [] }
let lockedUntil = 0
let used: UsedCall[] = []
const dispatch = vi.fn(() => ({ unwrap: async () => {} }))
let token: string | null = 'token'
const store = { dispatch, getState: () => ({ auth: { token }, usage: { used, lockedUntil } }) } as unknown as HarnessStore
const run = (signal = new AbortController().signal) => ({ store, signal })
const model = vi.mocked(callModel)

// `count` calls in the window, the first expiring in 1s, the next in 2s, and so on.
const fillWindow = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: i, sentAt: Date.now(), expiresAt: Date.now() + (i + 1) * 1000 }))

beforeEach(() => {
  token = 'token'
  lockedUntil = 0
  used = []
  dispatch.mockClear()
  model.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

test('retries a timeout and rereads the window for every attempt', async () => {
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

test('an overloaded Gemini is retried after 30 seconds, each attempt rereading the window', async () => {
  vi.useFakeTimers()
  model.mockRejectedValueOnce(new ModelUnavailableError('503')).mockResolvedValueOnce(reply)
  const result = callLoggedModel(request, run())
  await vi.advanceTimersByTimeAsync(29_999)
  expect(model).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  await expect(result).resolves.toBe(reply)
  expect(model).toHaveBeenCalledTimes(2)
  expect(dispatch).toHaveBeenCalledTimes(2)
})

test('an overloaded Gemini gives up after 3 retries', async () => {
  vi.useFakeTimers()
  model.mockRejectedValue(new ModelUnavailableError('503'))
  const result = callLoggedModel(request, run())
  const settled = expect(result).rejects.toBeInstanceOf(ModelUnavailableError)
  await vi.advanceTimersByTimeAsync(3 * 30_000)
  await settled
  expect(model).toHaveBeenCalledTimes(4)
})

test('no 503 retry once the rate window is locked', async () => {
  lockedUntil = Date.now() + 60_000
  model.mockRejectedValue(new ModelUnavailableError('503'))
  await expect(callLoggedModel(request, run())).rejects.toBeInstanceOf(ModelUnavailableError)
  expect(model).toHaveBeenCalledTimes(1)
})

test('Stop during the 503 wait aborts without another call', async () => {
  vi.useFakeTimers()
  model.mockRejectedValue(new ModelUnavailableError('503'))
  const stop = new AbortController()
  const result = callLoggedModel(request, run(stop.signal))
  const settled = expect(result).rejects.toThrow('stopped')
  await vi.advanceTimersByTimeAsync(10_000)
  stop.abort(new Error('stopped'))
  await settled
  expect(model).toHaveBeenCalledTimes(1)
})

test('a window one short of full does not wait', async () => {
  used = fillWindow(USAGE_LIMIT - 1)
  model.mockResolvedValue(reply)
  await expect(callLoggedModel(request, run())).resolves.toBe(reply)
})

test('a full window waits until 2 slots are free, then calls', async () => {
  vi.useFakeTimers()
  used = fillWindow(USAGE_LIMIT)
  model.mockResolvedValue(reply)
  const result = callLoggedModel(request, run())
  await vi.advanceTimersByTimeAsync(1000)
  // One slot free is not enough.
  expect(model).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1000)
  await expect(result).resolves.toBe(reply)
  expect(dispatch).toHaveBeenCalledTimes(1)
})

test('an over-full window waits until 2 slots are free below the limit', async () => {
  vi.useFakeTimers()
  // 11 calls (another visitor's landed before the lock): 3 must expire, the third at 3s.
  used = fillWindow(USAGE_LIMIT + 1)
  model.mockResolvedValue(reply)
  const result = callLoggedModel(request, run())
  await vi.advanceTimersByTimeAsync(2999)
  expect(model).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  await expect(result).resolves.toBe(reply)
})

test('waits again when other calls fill the window during the wait', async () => {
  vi.useFakeTimers()
  used = fillWindow(USAGE_LIMIT)
  model.mockResolvedValue(reply)
  const result = callLoggedModel(request, run())
  await vi.advanceTimersByTimeAsync(1000)
  // Another visitor's calls arrive (expiring 3s to 12s): the window is still full when the first wait ends at 2s.
  used = fillWindow(USAGE_LIMIT).map(call => ({ ...call, expiresAt: call.expiresAt + 1000 }))
  await vi.advanceTimersByTimeAsync(1000)
  expect(model).not.toHaveBeenCalled()
  // The second wait ends when the new window's second call expires, at 4s.
  await vi.advanceTimersByTimeAsync(1999)
  expect(model).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  await expect(result).resolves.toBe(reply)
})

test('Stop during the wait aborts without calling', async () => {
  vi.useFakeTimers()
  used = fillWindow(USAGE_LIMIT)
  const stop = new AbortController()
  const result = callLoggedModel(request, run(stop.signal))
  await vi.advanceTimersByTimeAsync(500)
  stop.abort(new Error('stopped'))
  await expect(result).rejects.toThrow('stopped')
  expect(model).not.toHaveBeenCalled()
})

test('sends the chat JWT with the call', async () => {
  model.mockResolvedValue(reply)
  await callLoggedModel(request, run())
  expect(model).toHaveBeenCalledWith(request, 'token', expect.any(AbortSignal), expect.any(Function))
})

test('no chat JWT: no read and no call', async () => {
  token = null
  await expect(callLoggedModel(request, run())).rejects.toBeInstanceOf(DataAccessError)
  expect(dispatch).not.toHaveBeenCalled()
  expect(model).not.toHaveBeenCalled()
})

test('createRun keeps the given signal: no harness timeout', () => {
  const signal = new AbortController().signal
  expect(createRun(store, signal).signal).toBe(signal)
})
