// @vitest-environment jsdom
// callLoggedModel: a timed-out model call is retried up to 3 times, each retry logged in the rate window;
// no retry once the window is locked, and none for other errors. Once the window is full a call waits until
// 2 slots are free. createRun adds no timeout to the run's signal.

import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { callModel, ModelTimeoutError } from '../connections/gemini'
import { USAGE_LIMIT, type UsedCall } from '../state/usage'
import { callLoggedModel, createRun, type HarnessStore } from './run'

vi.mock('../connections/gemini', async importOriginal => ({ ...(await importOriginal<object>()), callModel: vi.fn() }))

const reply = { message: { type: 'ai', data: {} }, text: 'ok', toolCalls: [] }
const request = { messages: [] }
let lockedUntil = 0
let used: UsedCall[] = []
const dispatch = vi.fn(() => ({ unwrap: async () => {} }))
const store = { dispatch, getState: () => ({ usage: { used, lockedUntil } }) } as unknown as HarnessStore
const run = (signal = new AbortController().signal) => ({ store, signal })
const model = vi.mocked(callModel)

// `count` calls in the window, the first expiring in 1s, the next in 2s, and so on.
const fillWindow = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: i, sentAt: Date.now(), expiresAt: Date.now() + (i + 1) * 1000 }))

beforeEach(() => {
  lockedUntil = 0
  used = []
  dispatch.mockClear()
  model.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
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

test('a window one short of full does not wait', async () => {
  used = fillWindow(USAGE_LIMIT - 1)
  model.mockResolvedValue(reply)
  await expect(callLoggedModel(request, run())).resolves.toBe(reply)
})

test('a full window waits until 2 slots are free, then logs and calls', async () => {
  vi.useFakeTimers()
  used = fillWindow(USAGE_LIMIT)
  model.mockResolvedValue(reply)
  const result = callLoggedModel(request, run())
  await vi.advanceTimersByTimeAsync(1000)
  // One slot free is not enough.
  expect(dispatch).not.toHaveBeenCalled()
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

test('Stop during the wait aborts without logging or calling', async () => {
  vi.useFakeTimers()
  used = fillWindow(USAGE_LIMIT)
  const stop = new AbortController()
  const result = callLoggedModel(request, run(stop.signal))
  await vi.advanceTimersByTimeAsync(500)
  stop.abort(new Error('stopped'))
  await expect(result).rejects.toThrow('stopped')
  expect(dispatch).not.toHaveBeenCalled()
  expect(model).not.toHaveBeenCalled()
})

test('createRun keeps the given signal: no harness timeout', () => {
  const signal = new AbortController().signal
  expect(createRun(store, signal).signal).toBe(signal)
})
