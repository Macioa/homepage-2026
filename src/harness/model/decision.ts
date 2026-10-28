// What the model may reply each step: call one tool, or give the final answer.
// A strict schema, rebuilt each step, goes to WebLLM's JSON mode so the grammar only allows valid moves.
// Replies are still parsed and checked against the same moves, so a model that ignores the grammar
// (or a test's scripted one) is held to them too, and every bad reply gets an error it can act on.

import { z } from 'zod'
import type { Limits } from '../config'
import { allCalls, lastCall } from '../state/selectors'
import type { Call, Session } from '../state/types'
import type { Registry, Tool } from '../tools'

const Final = z.object({
  type: z.literal('final'),
  answer: z.string(),
  // Ids of the tool calls the answer relies on, e.g. "search_experience#1". Checked by verify.ts.
  used: z.array(z.string()).default([])
})

const Envelope = z.discriminatedUnion('type', [
  z.object({ type: z.literal('tool'), tool: z.string(), args: z.unknown() }),
  Final
])

export type Decision = { type: 'tool'; tool: Tool; args: Record<string, unknown> } | z.infer<typeof Final>

export type Moves = { tools: Tool[]; final: boolean }

// What the model may do this step. A 1B model ignores these rules when they're only in the prompt:
// - Only tools offered for this prompt (send_message only when the visitor asks to contact Ryan).
// - Before any call: read-only tools, no final answer (look before answering or acting).
// - On the last step, or right after repeating a call that already succeeded: final answer only.
export function allowedMoves(registry: Registry, session: Session, step: number, limits: Limits): Moves {
  const offered = registry.offered(session.prompt)
  if (!allCalls(session).length) {
    const readOnly = offered.filter(tool => !tool.sideEffect)
    return { tools: readOnly, final: !readOnly.length }
  }
  const last = lastCall(session)
  const repeated = last?.status === 'ok' && last.attempts === 0
  if (step >= limits.maxSteps || repeated) return { tools: [], final: true }
  return { tools: offered, final: true }
}

export function decisionJsonSchema(moves: Moves, calls: Call[]) {
  const options: z.ZodType[] = moves.tools.map(tool =>
    z.object({ type: z.literal('tool'), tool: z.literal(tool.name), args: tool.args })
  )
  if (moves.final) {
    const citable = calls.filter(call => call.status === 'ok').map(call => call.id)
    const used = citable.length ? { used: z.array(z.enum(citable as [string, ...string[]])) } : {}
    options.push(z.object({ type: z.literal('final'), answer: z.string(), ...used }))
  }
  return JSON.stringify(z.toJSONSchema(z.union(options)))
}

// Errors are caveman: they go back to the model as notes.
export function parseDecision(
  raw: string,
  moves: Moves
): { ok: true; decision: Decision } | { ok: false; error: string } {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'not valid JSON' }
  }

  const envelope = Envelope.safeParse(json)
  if (!envelope.success) return { ok: false, error: `bad shape: ${z.prettifyError(envelope.error)}` }
  if (envelope.data.type === 'final') {
    return moves.final ? { ok: true, decision: envelope.data } : { ok: false, error: 'no final yet. call tool first' }
  }

  const name = envelope.data.tool
  const tool = moves.tools.find(t => t.name === name)
  if (!tool) {
    const names = moves.tools.map(t => t.name).join(', ')
    return { ok: false, error: names ? `no tool "${name}" now. tools: ${names}` : 'no tools now. give final' }
  }
  const args = tool.args.safeParse(envelope.data.args)
  if (!args.success) return { ok: false, error: `bad args for ${tool.name}: ${z.prettifyError(args.error)}` }
  return { ok: true, decision: { type: 'tool', tool, args: args.data } }
}
