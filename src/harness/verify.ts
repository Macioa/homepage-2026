// A final answer is accepted only if every call it cites ran this turn, succeeded, and still checks out.

import { withTimeout } from './async'
import type { Limits } from './config'
import { findCall } from './state/selectors'
import type { Rejection, Session } from './state/types'
import type { Registry } from './tools'

// Resolves to null when the answer checks out, or to the first problem found.
export async function verifyFinal(
  used: string[],
  session: Session,
  registry: Registry,
  limits: Limits
): Promise<Rejection | null> {
  for (const id of used) {
    const call = findCall(session, id)
    if (!call) return { id, problem: 'unknown' }
    if (call.status !== 'ok') return { id, problem: 'failed', error: call.error }

    const tool = registry.get(call.tool)
    if (!tool?.verify) continue
    const ctx = { callId: call.id, idempotencyKey: call.idempotencyKey }
    const confirmed = await withTimeout(limits.toolTimeoutMs, signal =>
      tool.verify!(call.args, call.result, { ...ctx, signal })
    ).catch(() => false)
    if (!confirmed) return { id, problem: 'unconfirmed' }
  }
  return null
}
