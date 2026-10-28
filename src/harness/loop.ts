// The agent loop for one turn: ask the model, act on its decision, feed back the result, repeat.
// Ends on a verified answer or a stop condition: step limit, deadline, stop button, repeats, bad replies.

import { settleBy } from './async'
import type { Limits } from './config'
import { problems } from './errors'
import type { Model } from './model/adapter'
import { compact, countTokens, observation } from './model/context'
import { allowedMoves, decisionJsonSchema, parseDecision, type Decision, type Moves } from './model/decision'
import { notes } from './model/prompt'
import { allCalls, sameCalls } from './state/selectors'
import {
  contextCompacted,
  decisionRejected,
  finalRejected,
  modelRequested,
  modelResponded,
  observationAdded,
  stepStarted
} from './state/slice'
import type { Session, TurnStatus } from './state/types'
import type { Registry, Tool } from './tools'
import { runTool, type Act } from './tools/runner'
import { verifyFinal } from './verify'

export type LoopContext = {
  act: Act
  getSession: () => Session
  model: Model
  registry: Registry
  limits: Limits
  signal: AbortSignal
  deadline: number
}

export type Outcome = { status: TurnStatus; answer: string }

export async function runLoop(ctx: LoopContext): Promise<Outcome> {
  const { act, getSession, limits } = ctx

  for (let step = 1; step <= limits.maxSteps; step++) {
    if (ctx.signal.aborted) return { status: 'stopped', answer: problems.stopped(step - 1) }
    if (Date.now() > ctx.deadline) return { status: 'timeout', answer: problems.timedOut(limits, step - 1) }
    act(stepStarted(step))

    const compacted = compact(getSession().messages, limits)
    if (compacted) act(contextCompacted(compacted))

    const moves = allowedMoves(ctx.registry, getSession(), step, limits)
    const outcome = await handleReply(ctx, await askModel(ctx, step, moves), moves)
    if (outcome) return outcome
  }

  return { status: 'max_steps', answer: problems.stepLimit(limits) }
}

async function askModel(ctx: LoopContext, step: number, moves: Moves) {
  const session = ctx.getSession()
  const schema = decisionJsonSchema(moves, allCalls(session))
  ctx.act(modelRequested({ step, tokens: countTokens(session.messages), schema }))
  const started = Date.now()
  const reply = ctx.model.complete(session.messages, { schema, maxTokens: ctx.limits.maxReplyTokens })
  // A stop or the turn deadline ends the wait; at the deadline the model is told to stop too.
  const raw = await settleBy(reply, { ...ctx, onDeadline: () => ctx.model.stop() })
  ctx.act(modelResponded({ raw, ms: Date.now() - started }))
  return raw
}

// Each handler returns an Outcome to end the turn, or null to take another step.
async function handleReply(ctx: LoopContext, raw: string, moves: Moves): Promise<Outcome | null> {
  const parsed = parseDecision(raw, moves)
  if (!parsed.ok) return rejectReply(ctx, raw, parsed.error)
  const { decision } = parsed
  return decision.type === 'final' ? checkFinal(ctx, decision) : callTool(ctx, decision.tool, decision.args)
}

function rejectReply(ctx: LoopContext, raw: string, error: string): Outcome | null {
  ctx.act(decisionRejected({ raw, error }))
  const count = ctx.getSession().rejections
  if (count > ctx.limits.maxInvalidDecisions) return { status: 'error', answer: problems.invalidReplies(count, error) }
  ctx.act(observationAdded(notes.replyRejected(error)))
  return null
}

async function checkFinal(ctx: LoopContext, final: Extract<Decision, { type: 'final' }>): Promise<Outcome | null> {
  const rejection = await verifyFinal(final.used, ctx.getSession(), ctx.registry, ctx.limits)
  if (!rejection) return { status: 'done', answer: final.answer }
  ctx.act(finalRejected({ answer: final.answer, rejection }))
  if (ctx.getSession().finalRejections > 1) {
    return { status: 'unverified', answer: problems.unverified(final.answer, rejection) }
  }
  ctx.act(observationAdded(notes.answerRejected(rejection)))
  return null
}

async function callTool(ctx: LoopContext, tool: Tool, args: Record<string, unknown>): Promise<Outcome | null> {
  const call = await runTool(ctx, tool, args)
  ctx.act(observationAdded(observation(call, ctx.limits)))
  const failed = sameCalls(ctx.getSession(), call).filter(c => c.status === 'failed')
  if (failed.length <= ctx.limits.maxRepeats) return null
  return { status: 'stuck', answer: problems.stuck(failed[0], failed.length) }
}
