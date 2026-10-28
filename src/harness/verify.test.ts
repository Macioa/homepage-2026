import { expect, test } from 'vitest'
import { z } from 'zod'
import { LIMITS } from './config'
import type { Call, Session } from './state/types'
import { createRegistry, defineTool } from './tools'
import { verifyFinal } from './verify'

const checked = (verify: () => Promise<boolean>) =>
  defineTool({ name: 'send', description: 'send', args: z.object({}), run: async () => 'ok', verify })
const plain = defineTool({ name: 'read', description: 'read', args: z.object({}), run: async () => 'ok' })

const session = (calls: Partial<Call>[]): Session => ({
  turnId: 't',
  prompt: { original: '', caveman: '' },
  status: 'running',
  step: 1,
  startedAt: 0,
  messages: [],
  rejections: 0,
  finalRejections: 0,
  tools: {
    x: calls.map(c => ({ id: 'x#1', tool: 'read', args: {}, signature: '', idempotencyKey: 'k', status: 'ok', attempts: 1, ...c }))
  }
})

const limits = { ...LIMITS, toolTimeoutMs: 30 }

test('accepts cited calls that succeeded (and pass their check)', async () => {
  const registry = createRegistry([plain, checked(async () => true)])
  const s = session([{ id: 'read#1' }, { id: 'send#1', tool: 'send' }])
  expect(await verifyFinal(['read#1', 'send#1'], s, registry, limits)).toBeNull()
  expect(await verifyFinal([], s, registry, limits)).toBeNull()
})

test('rejects a call that does not exist', async () => {
  expect(await verifyFinal(['ghost#9'], session([]), createRegistry([plain]), limits)).toEqual({
    id: 'ghost#9',
    problem: 'unknown'
  })
})

test('rejects a call that failed', async () => {
  const s = session([{ id: 'read#1', status: 'failed', error: 'boom' }])
  expect(await verifyFinal(['read#1'], s, createRegistry([plain]), limits)).toEqual({
    id: 'read#1',
    problem: 'failed',
    error: 'boom'
  })
})

test.each([
  ['returns false', () => Promise.resolve(false)],
  ['throws', () => Promise.reject(new Error('down'))],
  ['hangs', () => new Promise<boolean>(() => {})]
])('rejects a call whose check %s', async (_, verify) => {
  const s = session([{ id: 'send#1', tool: 'send' }])
  expect(await verifyFinal(['send#1'], s, createRegistry([checked(verify)]), limits)).toEqual({
    id: 'send#1',
    problem: 'unconfirmed'
  })
})
