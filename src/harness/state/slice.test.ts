import { describe, expect, test } from 'vitest'
import { activeCall, allCalls, findCall, lastCall, sameCalls } from './selectors'
import {
  contextCompacted,
  decisionRejected,
  finalRejected,
  harnessReducer,
  modelRequested,
  modelResponded,
  observationAdded,
  stepStarted,
  toolCallDeduped,
  toolCallFailed,
  toolCallRetried,
  toolCallStarted,
  toolCallSucceeded,
  turnFinished,
  turnStarted
} from './slice'
import type { Call, HarnessState } from './types'

const prompt = { original: 'Could you tell me?', caveman: 'tell?' }
const start = (turnId = 't1') =>
  turnStarted({ turnId, prompt, messages: [{ role: 'user', content: 'tell?' }], toolNames: ['a', 'b'], at: 5 })
const call = (id: string, over: Partial<Call> = {}): Call => ({
  id,
  tool: 'a',
  args: { q: id },
  signature: `a:${id}`,
  idempotencyKey: `t1:${id}`,
  status: 'started',
  attempts: 1,
  ...over
})

const run = (...actions: Parameters<typeof harnessReducer>[1][]) =>
  actions.reduce<HarnessState>((state, action) => harnessReducer(state, action), harnessReducer(undefined, { type: '' }))

describe('harness slice', () => {
  test('starts idle', () => {
    expect(run()).toMatchObject({ history: [], session: { status: 'idle', turnId: null, prompt: { original: '' } } })
  })

  test('turnStarted resets the session, keeps the prompt pair, reserves a key per tool', () => {
    const state = run(start('t1'), toolCallStarted(call('a#1')), start('t2'))
    expect(state.session).toMatchObject({ turnId: 't2', prompt, status: 'running', startedAt: 5, step: 0 })
    expect(state.session.tools).toEqual({ a: [], b: [] })
    expect(state.history.map(t => t.id)).toEqual(['t1', 't2'])
    expect(state.history[1]).toEqual({ id: 't2', prompt, status: 'running' })
  })

  test('steps, model replies and observations build the context', () => {
    const state = run(
      start(),
      stepStarted(1),
      modelRequested({ step: 1, tokens: 3, schema: '{}' }),
      modelResponded({ raw: '{"type":"tool"}', ms: 9 }),
      observationAdded({ role: 'user', kind: 'note', content: 'n' })
    )
    expect(state.session.step).toBe(1)
    expect(state.session.messages.map(m => m.content)).toEqual(['tell?', '{"type":"tool"}', 'n'])
  })

  test('tool call lifecycle', () => {
    const state = run(
      start(),
      toolCallStarted(call('a#1')),
      toolCallRetried({ tool: 'a', id: 'a#1', reason: 'timed out' }),
      toolCallSucceeded({ tool: 'a', id: 'a#1', result: { ok: 1 }, ms: 7 }),
      toolCallStarted(call('a#2')),
      toolCallFailed({ tool: 'a', id: 'a#2', kind: 'error', error: 'boom', ms: 3 }),
      toolCallDeduped(call('a#3', { status: 'ok', attempts: 0, result: { ok: 1 } })),
      toolCallStarted(call('b#1', { tool: 'b' }))
    )
    expect(state.session.tools.a).toMatchObject([
      { id: 'a#1', status: 'ok', attempts: 2, result: { ok: 1 }, ms: 7 },
      { id: 'a#2', status: 'failed', kind: 'error', error: 'boom', ms: 3 },
      { id: 'a#3', status: 'ok', attempts: 0 }
    ])
    expect(activeCall(state.session)?.id).toBe('b#1')
    expect(lastCall(state.session)).toBeUndefined()
    const seen = harnessReducer(state, observationAdded({ role: 'user', kind: 'observation', callId: 'a#2', content: '' }))
    expect(lastCall(seen.session)?.id).toBe('a#2')
    expect(allCalls(state.session).map(c => c.id)).toEqual(['a#1', 'a#2', 'a#3', 'b#1'])
    expect(findCall(state.session, 'a#2')?.error).toBe('boom')
    expect(findCall(state.session, 'nope')).toBeUndefined()
    expect(sameCalls(state.session, call('a#9', { signature: 'a:a#1' })).map(c => c.id)).toEqual(['a#1'])
  })

  test('a call for a tool without a key still gets recorded', () => {
    const state = run(start(), toolCallStarted(call('z#1', { tool: 'z' })))
    expect(state.session.tools.z).toHaveLength(1)
  })

  test('counters, compaction and finishing', () => {
    const state = run(
      start(),
      decisionRejected({ raw: 'x', error: 'not valid JSON' }),
      finalRejected({ answer: 'a', rejection: { id: 'a#1', problem: 'unknown' } }),
      contextCompacted({ messages: [{ role: 'system', content: 's' }], before: 10, after: 1 }),
      turnFinished({ status: 'done', answer: 'Hello.' })
    )
    expect(state.session).toMatchObject({ rejections: 1, finalRejections: 1, status: 'done' })
    expect(state.session.messages).toEqual([{ role: 'system', content: 's' }])
    expect(state.history[0]).toMatchObject({ status: 'done', answer: 'Hello.' })
  })
})
