// The harness controller: the one thing the UI talks to. It owns the turn lifecycle and sends every
// state change through `act` (a Redux action, then a journal save). The loop itself is in loop.ts.

import type { UnknownAction } from '@reduxjs/toolkit'
import { settleBy, TimeoutError } from './async'
import { LIMITS, type Limits } from './config'
import { problems } from './errors'
import { createJournal, type Journal } from './journal'
import { runLoop, type Outcome } from './loop'
import type { Model } from './model/adapter'
import { caveman } from './model/caveman'
import { initialMessages, recentTurns } from './model/prompt'
import { recoverTurn } from './recovery'
import { answerCompressed, promptCompressed, turnFinished, turnStarted } from './state/slice'
import type { HarnessState, Turn } from './state/types'
import { createRegistry, tools as defaultTools, type Tool } from './tools'

export { webllmModel } from './model/adapter'

export type HarnessStore = {
  dispatch(action: UnknownAction): unknown
  getState(): { harness: HarnessState }
}

export type Harness = ReturnType<typeof createHarness>

export function createHarness({
  store,
  model,
  tools = defaultTools,
  journal = createJournal(),
  limits: overrides = {}
}: {
  store: HarnessStore
  model: Model
  tools?: Tool[]
  journal?: Journal
  limits?: Partial<Limits>
}) {
  const limits = { ...LIMITS, ...overrides }
  const registry = createRegistry(tools)
  const state = () => store.getState().harness
  const getSession = () => state().session
  let turn: AbortController | null = null
  let recovery: Promise<void> | null = null

  const act = (action: UnknownAction) => {
    store.dispatch(action)
    journal.save(getSession())
  }

  // Why a turn that threw ended: the stop button, the turn deadline, or a real failure.
  function failure(err: unknown, signal: AbortSignal, deadline: number): Outcome {
    const { step } = getSession()
    if (signal.aborted) return { status: 'stopped', answer: problems.stopped(step) }
    if (err instanceof TimeoutError || Date.now() > deadline) {
      return { status: 'timeout', answer: problems.timedOut(limits, step) }
    }
    console.error('Harness turn failed:', err)
    return { status: 'error', answer: problems.failed(err instanceof Error ? err.message : String(err)) }
  }

  // The turn's first step, before the loop: the model rewrites the visitor's prompt caveman, and any
  // past answer the context needs that it hasn't rewritten yet. The loop's context is built from those.
  async function compress(original: string, signal: AbortSignal, deadline: number) {
    const shorten = (text: string) =>
      settleBy(caveman(model, text, limits.cavemanMaxTokens), { signal, deadline, onDeadline: () => model.stop() })
    for (const past of recentTurns(state().history, limits)) {
      if (past.answerCaveman === undefined) {
        act(answerCompressed({ turnId: past.id, caveman: await shorten(past.answer ?? '') }))
      }
    }
    const prompt = { original, caveman: await shorten(original) }
    act(promptCompressed({ caveman: prompt.caveman, messages: initialMessages(registry, state().history, prompt, limits) }))
  }

  // Runs one visitor prompt to a final answer. Resolves to the finished history turn.
  async function run(text: string): Promise<Turn> {
    if (turn) throw new Error('A turn is already running.')
    const controller = (turn = new AbortController())
    const deadline = Date.now() + limits.turnTimeoutMs
    const prompt = { original: text, caveman: '' }
    act(turnStarted({ turnId: crypto.randomUUID(), prompt, messages: [], toolNames: registry.names, at: Date.now() }))

    let outcome: Outcome
    try {
      await compress(text, controller.signal, deadline)
      outcome = await runLoop({ act, getSession, model, registry, limits, signal: controller.signal, deadline })
    } catch (err) {
      outcome = failure(err, controller.signal, deadline)
    }
    act(turnFinished(outcome))
    turn = null
    return state().history.at(-1)!
  }

  function stop() {
    if (!turn) return
    turn.abort()
    model.stop()
  }

  // Once per page (see recovery.ts). Later calls share the first one's promise.
  function recover() {
    recovery ??= recoverTurn({ act, getSession, journal, registry, limits })
    return recovery
  }

  return { run, stop, recover }
}
