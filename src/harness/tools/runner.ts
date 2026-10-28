// Runs one validated tool call: skips repeats, times out, and retries once with the same idempotency key.

import type { UnknownAction } from '@reduxjs/toolkit'
import { TimeoutError, withTimeout } from '../async'
import type { Limits } from '../config'
import { findCall } from '../state/selectors'
import { toolCallDeduped, toolCallFailed, toolCallRetried, toolCallStarted, toolCallSucceeded } from '../state/slice'
import type { Call, Session } from '../state/types'
import type { Tool } from './defineTool'

export type Act = (action: UnknownAction) => void

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

// Same tool + same args (in any key order) = same signature.
export const signature = (tool: string, args: unknown) => `${tool}:${stableStringify(args)}`

// Runs an already-started call to the end. Also used to replay a call after a crash.
export async function execute(act: Act, tool: Tool, call: Call, limits: Limits) {
  const started = Date.now()
  const ctx = { callId: call.id, idempotencyKey: call.idempotencyKey }
  for (let attempt = 1; ; attempt++) {
    try {
      const result = await withTimeout(tool.timeoutMs ?? limits.toolTimeoutMs, signal =>
        tool.run(call.args, { ...ctx, signal })
      )
      act(toolCallSucceeded({ tool: tool.name, id: call.id, result, ms: Date.now() - started }))
      return
    } catch (err) {
      const timedOut = err instanceof TimeoutError
      const message = err instanceof Error ? err.message : String(err)
      // A timeout may mean the tool worked and only its response was lost, so retry with the same key.
      if (timedOut && attempt <= limits.toolRetries) {
        act(toolCallRetried({ tool: tool.name, id: call.id, reason: message }))
        continue
      }
      const kind = timedOut ? 'timeout' : 'error'
      act(toolCallFailed({ tool: tool.name, id: call.id, kind, error: message, ms: Date.now() - started }))
      return
    }
  }
}

export async function runTool(
  { act, getSession, limits }: { act: Act; getSession: () => Session; limits: Limits },
  tool: Tool,
  args: Record<string, unknown>
): Promise<Call> {
  const session = getSession()
  const calls = session.tools[tool.name]
  const id = `${tool.name}#${calls.length + 1}`
  const base = {
    id,
    tool: tool.name,
    args,
    signature: signature(tool.name, args),
    idempotencyKey: `${session.turnId}:${id}`
  }

  // The first identical call that actually ran: reuse its result, or refuse to repeat its failure.
  // A repeat is that same call, so it keeps that call's idempotency key (verify checks the key that ran).
  const earlier = calls.find(call => call.signature === base.signature && call.attempts > 0)
  const repeat = { ...base, idempotencyKey: earlier?.idempotencyKey ?? base.idempotencyKey, attempts: 0 }
  if (earlier?.status === 'ok') {
    act(toolCallDeduped({ ...repeat, status: 'ok', result: earlier.result }))
  } else if (earlier?.status === 'failed') {
    const error = `same call failed before as ${earlier.id} (${earlier.error}). no repeat`
    act(toolCallDeduped({ ...repeat, status: 'failed', kind: 'repeat', error }))
  } else {
    act(toolCallStarted({ ...base, status: 'started', attempts: 1 }))
    await execute(act, tool, findCall(getSession(), id)!, limits)
  }
  return findCall(getSession(), id)!
}
