import { describe, expect, test } from 'vitest'
import { LIMITS } from '../config'
import type { Call, Msg, Session } from '../state/types'
import { createRegistry } from '../tools'
import { allowedMoves, decisionJsonSchema, parseDecision, type Moves } from './decision'
import { asPrompt } from '../testing'

const registry = createRegistry()

const call = (id: string, status: Call['status'] = 'ok', attempts = 1): Call => ({
  id,
  tool: id.split('#')[0],
  args: {},
  signature: id,
  idempotencyKey: id,
  status,
  attempts
})

// A session whose calls were seen by the model in the given order.
function session(prompt: string, calls: Call[] = []): Session {
  const tools: Record<string, Call[]> = {}
  for (const c of calls) (tools[c.tool] ??= []).push(c)
  const messages: Msg[] = calls.map(c => ({ role: 'user', kind: 'observation', callId: c.id, content: '' }))
  return { turnId: 't', prompt: asPrompt(prompt), status: 'running', step: 1, startedAt: 0, messages, tools, rejections: 0, finalRejections: 0 }
}

const names = (moves: Moves) => [...moves.tools.map(t => t.name), ...(moves.final ? ['final'] : [])]

describe('allowedMoves', () => {
  test('first step: read-only tools, no final answer', () => {
    expect(names(allowedMoves(registry, session('Please send Ryan a message'), 1, LIMITS))).toEqual([
      'search_experience',
      'search_projects'
    ])
  })

  test('after a call: offered tools and a final answer', () => {
    const calls = [call('search_projects#1')]
    expect(names(allowedMoves(registry, session('What did he build?', calls), 2, LIMITS))).toEqual([
      'search_experience',
      'search_projects',
      'final'
    ])
    expect(names(allowedMoves(registry, session('Please send Ryan a message', calls), 2, LIMITS))).toEqual([
      'search_experience',
      'search_projects',
      'send_message',
      'final'
    ])
  })

  test('final answer only on the last step, or after a repeated successful call', () => {
    const calls = [call('search_projects#1')]
    expect(names(allowedMoves(registry, session('x', calls), LIMITS.maxSteps, LIMITS))).toEqual(['final'])
    const repeated = [call('search_projects#1'), call('search_projects#2', 'ok', 0)]
    expect(names(allowedMoves(registry, session('x', repeated), 3, LIMITS))).toEqual(['final'])
    const refused = [call('search_projects#1', 'failed'), call('search_projects#2', 'failed', 0)]
    expect(names(allowedMoves(registry, session('x', refused), 3, LIMITS))).toContain('search_projects')
  })

  test('with only side-effect tools, the first step may answer', () => {
    const onlySend = createRegistry([registry.get('send_message')!])
    expect(names(allowedMoves(onlySend, session('contact Ryan'), 1, LIMITS))).toEqual(['final'])
  })
})

describe('decisionJsonSchema', () => {
  const tools = registry.list.slice(0, 2)

  test('one option per allowed tool, with its args schema', () => {
    const schema = JSON.parse(decisionJsonSchema({ tools, final: false }, []))
    expect(schema.anyOf.map((o: any) => o.properties.tool.const)).toEqual(['search_experience', 'search_projects'])
    expect(schema.anyOf[0].properties.args).toMatchObject({ type: 'object', required: ['query'] })
  })

  test('a final answer may cite only calls that succeeded', () => {
    const finalOption = JSON.parse(
      decisionJsonSchema({ tools: [], final: true }, [call('search_projects#1'), call('search_experience#1', 'failed')])
    ).anyOf[0]
    expect(finalOption.properties.used.items.enum).toEqual(['search_projects#1'])
    expect(finalOption.required).toEqual(['type', 'answer', 'used'])
  })

  test('nothing succeeded: a final answer has no used field', () => {
    const finalOption = JSON.parse(decisionJsonSchema({ tools: [], final: true }, [call('x#1', 'failed')])).anyOf[0]
    expect(finalOption.properties).not.toHaveProperty('used')
  })
})

describe('parseDecision', () => {
  const open: Moves = { tools: registry.list.slice(0, 2), final: true }

  test('tool call', () => {
    const parsed = parseDecision('{"type":"tool","tool":"search_projects","args":{"query":"x"}}', open)
    expect(parsed).toMatchObject({ ok: true, decision: { type: 'tool', args: { query: 'x' } } })
    expect(parsed.ok && parsed.decision.type === 'tool' && parsed.decision.tool.name).toBe('search_projects')
  })

  test('final answer, used defaults to []', () => {
    expect(parseDecision('{"type":"final","answer":"Hi."}', open)).toEqual({
      ok: true,
      decision: { type: 'final', answer: 'Hi.', used: [] }
    })
  })

  test.each([
    ['not json', open, 'not valid JSON'],
    ['{"type":"shout"}', open, 'bad shape:'],
    ['{"type":"tool","tool":"send_message","args":{}}', open, 'no tool "send_message" now. tools: search_experience, search_projects'],
    ['{"type":"tool","tool":"search_projects","args":{"q":1}}', open, 'bad args for search_projects:'],
    ['{"type":"final","answer":"Hi."}', { ...open, final: false }, 'no final yet. call tool first'],
    ['{"type":"tool","tool":"search_projects","args":{"query":"x"}}', { tools: [], final: true }, 'no tools now. give final']
  ])('rejects %s', (raw, moves, error) => {
    const parsed = parseDecision(raw, moves)
    expect(parsed.ok).toBe(false)
    expect(!parsed.ok && parsed.error).toContain(error)
  })
})
