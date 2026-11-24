// @vitest-environment jsdom
// callLoggedModel: a timed-out model call is retried up to 2 times, each retry rereading the rate window first;
// no retry once the window is locked, and none for other errors. An overloaded Gemini (503) is retried the
// same way after a 30 second wait. After 3 failed Gemini requests the run moves to OpenRouter. The cooldown
// notice is on during a wait and off once a request succeeds. Once the window is full a call waits until 2 slots are free. createRun
// adds no timeout to the run's signal.

import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { callModel, ModelTimeoutError, ModelUnavailableError } from '../connections/gemini'
import { DataAccessError } from '../connections/supabase'
import { recordModelCall, type ModelCallRecord } from '../state/modelCalls'
import { USAGE_LIMIT, type UsedCall } from '../state/usage'
import { callLoggedModel, createRun, type HarnessStore } from './run'

vi.mock('../connections/gemini', async importOriginal => ({ ...(await importOriginal<object>()), callModel: vi.fn() }))

const reply = { message: { type: 'ai', data: {} }, text: 'ok', toolCalls: [], model: 'm' }
const request = { messages: [] }
let lockedUntil = 0
let used: UsedCall[] = []
const dispatch = vi.fn((_action: unknown) => ({ unwrap: async () => {} }))
// Rate window reads are thunks; model call records are plain actions.
const reads = () => dispatch.mock.calls.filter(([action]) => typeof action === 'function').length
const records = () => dispatch.mock.calls.map(([action]) => action).filter((action): action is { type: string; payload: ModelCallRecord } => (action as { type?: string }).type === recordModelCall.type).map(({ payload }) => payload)
let token: string | null = 'token'
let useBackupLlm = false
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}
const enableBackup = () => {
  useBackupLlm = true
  listeners.forEach(listener => listener())
}
const store = { dispatch, subscribe, getState: () => ({ auth: { token }, ui: { useBackupLlm }, usage: { used, lockedUntil } }) } as unknown as HarnessStore
const run = (signal = new AbortController().signal) => ({ store, signal })
const model = vi.mocked(callModel)

// `count` calls in the window, the first expiring in 1s, the next in 2s, and so on.
const fillWindow = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: i, sentAt: Date.now(), expiresAt: Date.now() + (i + 1) * 1000 }))

beforeEach(() => {
  token = 'token'
  useBackupLlm = false
  listeners.clear()
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
  expect(reads()).toBe(3)
})

const providers = () => model.mock.calls.map(([sent]) => sent.provider)

test('three failed Gemini requests fall back to OpenRouter', async () => {
  model.mockRejectedValueOnce(new ModelTimeoutError('t')).mockRejectedValueOnce(new ModelTimeoutError('t')).mockRejectedValueOnce(new ModelTimeoutError('t')).mockResolvedValueOnce(reply)
  await expect(callLoggedModel(request, run())).resolves.toBe(reply)
  expect(providers()).toEqual([undefined, undefined, undefined, 'openrouter'])
})

test('the rest of the run stays on OpenRouter', async () => {
  model.mockRejectedValueOnce(new ModelTimeoutError('t')).mockRejectedValueOnce(new ModelTimeoutError('t')).mockRejectedValueOnce(new ModelTimeoutError('t')).mockResolvedValue(reply)
  const sameRun = run()
  await callLoggedModel(request, sameRun)
  await callLoggedModel(request, sameRun)
  expect(providers()).toEqual([undefined, undefined, undefined, 'openrouter', 'openrouter'])
})

test('gives up when the fallback fails too', async () => {
  model.mockRejectedValue(new ModelTimeoutError('t'))
  await expect(callLoggedModel(request, run())).rejects.toBeInstanceOf(ModelTimeoutError)
  expect(providers()).toEqual([undefined, undefined, undefined, 'openrouter'])
})

test('the cooldown notice is on during a 503 wait and off after success', async () => {
  vi.useFakeTimers()
  const onCooldown = vi.fn()
  const onFallback = vi.fn()
  model.mockRejectedValueOnce(new ModelUnavailableError('503')).mockResolvedValueOnce(reply)
  const result = callLoggedModel(request, { ...run(), events: { onCooldown, onFallback } })
  await vi.advanceTimersByTimeAsync(1)
  expect(onCooldown.mock.calls).toEqual([[true]])
  await vi.advanceTimersByTimeAsync(30_000)
  await result
  expect(onCooldown.mock.calls).toEqual([[true], [false]])
  expect(onFallback).not.toHaveBeenCalled()
})

test('useBackupLlm sends every call to OpenRouter, outside the rate window', async () => {
  useBackupLlm = true
  used = fillWindow(USAGE_LIMIT)
  model.mockResolvedValue(reply)
  await callLoggedModel(request, run())
  expect(providers()).toEqual(['openrouter'])
  expect(reads()).toBe(0)
})

test('choosing the backup ends a 503 wait at once', async () => {
  vi.useFakeTimers()
  model.mockRejectedValueOnce(new ModelUnavailableError('503')).mockResolvedValueOnce(reply)
  const result = callLoggedModel(request, run())
  await vi.advanceTimersByTimeAsync(1000)
  enableBackup()
  await expect(result).resolves.toBe(reply)
  expect(providers()).toEqual([undefined, 'openrouter'])
  expect(listeners.size).toBe(0)
})

test('choosing the backup ends a full-window wait at once', async () => {
  vi.useFakeTimers()
  used = fillWindow(USAGE_LIMIT)
  model.mockResolvedValue(reply)
  const result = callLoggedModel(request, run())
  await vi.advanceTimersByTimeAsync(100)
  enableBackup()
  await expect(result).resolves.toBe(reply)
  expect(providers()).toEqual(['openrouter'])
})

test('the fallback tells the UI once, and skips the rate window', async () => {
  const onCooldown = vi.fn()
  const onFallback = vi.fn()
  // A full window would make a rate-limited call wait.
  model.mockRejectedValueOnce(new ModelTimeoutError('t')).mockRejectedValueOnce(new ModelTimeoutError('t')).mockRejectedValueOnce(new ModelTimeoutError('t')).mockImplementation(async () => {
    used = fillWindow(USAGE_LIMIT)
    return reply
  })
  const sameRun = { ...run(), events: { onCooldown, onFallback } }
  await callLoggedModel(request, sameRun)
  await callLoggedModel(request, sameRun)
  expect(onFallback).toHaveBeenCalledTimes(1)
  expect(providers()).toEqual([undefined, undefined, undefined, 'openrouter', 'openrouter'])
  expect(reads()).toBe(3)
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
  expect(reads()).toBe(2)
})

test('an overloaded Gemini falls back after 2 waits, with no wait before OpenRouter', async () => {
  vi.useFakeTimers()
  model.mockRejectedValueOnce(new ModelUnavailableError('503')).mockRejectedValueOnce(new ModelUnavailableError('503')).mockRejectedValueOnce(new ModelUnavailableError('503')).mockResolvedValueOnce(reply)
  const result = callLoggedModel(request, run())
  await vi.advanceTimersByTimeAsync(2 * 30_000)
  await expect(result).resolves.toBe(reply)
  expect(providers()).toEqual([undefined, undefined, undefined, 'openrouter'])
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
  expect(reads()).toBe(1)
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

test('every call is logged with its provider, model, tool choice and reply or error', async () => {
  const finish = { id: '1', name: 'finish_and_reply', args: { reply: 'done' } }
  model
    .mockRejectedValueOnce(new ModelTimeoutError('t1'))
    .mockRejectedValueOnce(new ModelTimeoutError('t2'))
    .mockRejectedValueOnce(new ModelTimeoutError('t3'))
    .mockResolvedValueOnce({ ...reply, text: '', toolCalls: [finish], model: 'free/model-x' })
  await callLoggedModel({ messages: [], toolChoice: 'any' }, run())
  expect(records().map(({ provider, model, toolChoice, error, toolCalls }) => ({ provider, model, toolChoice, error, toolCalls }))).toEqual([
    { provider: 'gemini', model: null, toolChoice: 'any', error: 't1', toolCalls: [] },
    { provider: 'gemini', model: null, toolChoice: 'any', error: 't2', toolCalls: [] },
    { provider: 'gemini', model: null, toolChoice: 'any', error: 't3', toolCalls: [] },
    { provider: 'openrouter', model: 'free/model-x', toolChoice: 'any', error: null, toolCalls: [finish] }
  ])
})

test('a stopped call is not logged', async () => {
  const stop = new AbortController()
  model.mockImplementation(async () => {
    stop.abort(new Error('stopped'))
    throw new Error('stopped')
  })
  await expect(callLoggedModel(request, run(stop.signal))).rejects.toThrow('stopped')
  expect(records()).toEqual([])
})

test('sends the chat JWT with the call', async () => {
  model.mockResolvedValue(reply)
  await callLoggedModel(request, run())
  expect(model).toHaveBeenCalledWith(request, 'token', expect.any(AbortSignal), expect.any(Function))
})

test('no chat JWT: no read and no call', async () => {
  token = null
  await expect(callLoggedModel(request, run())).rejects.toBeInstanceOf(DataAccessError)
  expect(reads()).toBe(0)
  expect(model).not.toHaveBeenCalled()
})

test('createRun keeps the given signal: no harness timeout', () => {
  const signal = new AbortController().signal
  expect(createRun(store, signal).signal).toBe(signal)
})
