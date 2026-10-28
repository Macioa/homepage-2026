import { expect, test } from 'vitest'
import { createJournal } from './journal'
import type { Session } from './state/types'
import { memoryStore } from './testing'

const session = (over: Partial<Session> = {}): Session => ({
  turnId: 't1',
  prompt: { original: 'Please hi', caveman: 'hi' },
  status: 'running',
  step: 1,
  startedAt: 0,
  messages: [{ role: 'user', content: 'hi' }],
  rejections: 0,
  finalRejections: 0,
  tools: {
    send: [
      { id: 'send#1', tool: 'send', args: { m: 1 }, signature: 's', idempotencyKey: 't1:send#1', status: 'started', attempts: 1, result: 'big' }
    ]
  },
  ...over
})

test('saves just enough to reconcile calls: no results, no messages', () => {
  const store = memoryStore()
  const journal = createJournal(store)
  journal.save(session())
  expect(journal.load()).toEqual({
    turnId: 't1',
    prompt: { original: 'Please hi', caveman: 'hi' },
    status: 'running',
    calls: [{ id: 'send#1', tool: 'send', args: { m: 1 }, idempotencyKey: 't1:send#1', status: 'started' }]
  })
})

test('skips an idle session', () => {
  const journal = createJournal(memoryStore())
  journal.save(session({ turnId: null }))
  expect(journal.load()).toBeNull()
})

test('reads nothing back from empty or corrupt storage', () => {
  const store = memoryStore()
  const journal = createJournal(store)
  expect(journal.load()).toBeNull()
  store.set('harness:journal:v2', '{not json')
  expect(journal.load()).toBeNull()
})

test('defaults to sessionStorage and survives it being unavailable', () => {
  const journal = createJournal()
  expect(() => journal.save(session())).not.toThrow()
})
