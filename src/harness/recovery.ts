// After a page reload: settle the calls the previous page left mid-flight. Side-effect calls are
// replayed with their original idempotency key (the backend dedupes them); read-only calls are marked
// interrupted. The turn itself is not resumed; it lands in history as interrupted.

import type { Limits } from './config'
import { problems } from './errors'
import type { Journal } from './journal'
import { allCalls } from './state/selectors'
import { toolCallFailed, toolCallStarted, turnFinished, turnStarted } from './state/slice'
import type { Session } from './state/types'
import type { Registry } from './tools'
import { execute, signature, type Act } from './tools/runner'

type Deps = { act: Act; getSession: () => Session; journal: Journal; registry: Registry; limits: Limits }

export async function recoverTurn({ act, getSession, journal, registry, limits }: Deps) {
  const entry = journal.load()
  if (entry?.status !== 'running') return

  const { turnId, prompt } = entry
  act(turnStarted({ turnId, prompt, messages: [], toolNames: registry.names, at: Date.now() }))
  for (const saved of entry.calls.filter(call => call.status === 'started')) {
    const call = { ...saved, signature: signature(saved.tool, saved.args), status: 'started' as const, attempts: 1 }
    act(toolCallStarted(call))
    const tool = registry.get(call.tool)
    if (tool?.sideEffect) await execute(act, tool, call, limits)
    else act(toolCallFailed({ tool: call.tool, id: call.id, kind: 'interrupted', error: 'page reloaded' }))
  }

  const replayed = allCalls(getSession()).filter(call => call.kind !== 'interrupted')
  act(turnFinished({ status: 'interrupted', answer: problems.interrupted(replayed) }))
}
