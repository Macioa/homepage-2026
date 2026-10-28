// Time limits for promises that may never settle (fake tools that hang, a stalled model).

export class TimeoutError extends Error {}

// Runs fn with a signal that aborts after ms; rejects with TimeoutError if fn hasn't settled by then.
export async function withTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new TimeoutError(`timed out after ${ms} ms`))
    }, ms)
  })
  try {
    return await Promise.race([fn(controller.signal), timeout])
  } finally {
    clearTimeout(timer)
  }
}

// Settles like `promise`, but rejects early when `signal` aborts or `deadline` (epoch ms) passes.
// onDeadline runs first so the caller can cancel the work it gave up on.
export function settleBy<T>(
  promise: Promise<T>,
  { signal, deadline, onDeadline }: { signal: AbortSignal; deadline: number; onDeadline: () => void }
): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new Error('stopped'))
    const timer = setTimeout(() => {
      onDeadline()
      reject(new TimeoutError('turn deadline passed'))
    }, Math.max(0, deadline - Date.now()))
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
    })
  })
}
