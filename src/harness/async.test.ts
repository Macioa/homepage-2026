import { describe, expect, test, vi } from 'vitest'
import { settleBy, TimeoutError, withTimeout } from './async'

const never = () => new Promise<string>(() => {})

describe('withTimeout', () => {
  test('passes a result through', async () => {
    expect(await withTimeout(50, async () => 'ok')).toBe('ok')
  })

  test('passes an error through', async () => {
    await expect(withTimeout(50, async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
  })

  test('rejects with TimeoutError and aborts the signal', async () => {
    let signal: AbortSignal | undefined
    const result = withTimeout(20, s => ((signal = s), never()))
    await expect(result).rejects.toBeInstanceOf(TimeoutError)
    await expect(result).rejects.toThrow('timed out after 20 ms')
    expect(signal?.aborted).toBe(true)
  })
})

describe('settleBy', () => {
  const opts = (deadlineIn: number, controller = new AbortController(), onDeadline = vi.fn()) => ({
    signal: controller.signal,
    deadline: Date.now() + deadlineIn,
    onDeadline
  })

  test('settles like the promise', async () => {
    expect(await settleBy(Promise.resolve(1), opts(1000))).toBe(1)
    await expect(settleBy(Promise.reject(new Error('x')), opts(1000))).rejects.toThrow('x')
  })

  test('rejects when the signal aborts', async () => {
    const controller = new AbortController()
    const result = settleBy(never(), opts(1000, controller))
    controller.abort()
    await expect(result).rejects.toThrow('stopped')
  })

  test('rejects at the deadline, after calling onDeadline', async () => {
    const onDeadline = vi.fn()
    await expect(settleBy(never(), opts(20, undefined, onDeadline))).rejects.toBeInstanceOf(TimeoutError)
    expect(onDeadline).toHaveBeenCalledOnce()
  })
})
