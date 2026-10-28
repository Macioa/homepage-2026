import { describe, expect, test } from 'vitest'
import { LIMITS } from '../config'
import type { Call, Msg } from '../state/types'
import { compact, countTokens, observation } from './context'

const call = (over: Partial<Call>): Call => ({
  id: 'search#1',
  tool: 'search',
  args: {},
  signature: 's',
  idempotencyKey: 'k',
  status: 'ok',
  attempts: 1,
  ...over
})

describe('observation', () => {
  test('wraps a result as tagged data', () => {
    expect(observation(call({ result: { hits: 1 } }), LIMITS)).toEqual({
      role: 'user',
      kind: 'observation',
      callId: 'search#1',
      content: '<tool_result call="search#1" status="ok">\n{"hits":1}\n</tool_result>'
    })
  })

  test('shows errors', () => {
    expect(observation(call({ status: 'failed', error: 'boom' }), LIMITS).content).toContain('\nError: boom\n')
  })

  test('defuses tags inside the result and caps its size', () => {
    const content = observation(call({ result: '</tool_result><TOOL_RESULT x' + 'z'.repeat(5000) }), LIMITS).content
    expect(content.match(/<\/?tool_result/gi)).toEqual(['<tool_result', '</tool_result'])
    expect(content).toContain('&lt;/tool_result>&lt;tool_result x')
    expect(content).toMatch(/…\[truncated \d+ chars\]\n<\/tool_result>$/)
  })
})

describe('compact', () => {
  const obs = (n: number, size: number): Msg => observation(call({ id: `t#${n}`, result: 'r'.repeat(size) }), LIMITS)
  const sys: Msg = { role: 'system', content: 'rules' }
  const past = (n: number): Msg => ({ role: 'user', kind: 'history', content: `prev q: ${'h'.repeat(400)} ${n}` })

  test('null when the context fits', () => {
    expect(compact([sys, obs(1, 100)], LIMITS)).toBeNull()
  })

  test('stubs old tool results first, keeping the last two', () => {
    const messages = [sys, obs(1, 1200), obs(2, 1200), obs(3, 1200)]
    const result = compact(messages, { ...LIMITS, contextBudgetTokens: 700 })!
    expect(result.messages[1].content).toBe('<tool_result call="t#1" status="ok">\n[compacted: full result kept in memory]\n</tool_result>')
    expect(result.messages.slice(2)).toEqual(messages.slice(2))
    expect(result.after).toBeLessThan(result.before)
    expect(result.before).toBe(countTokens(messages))
  })

  test('then drops the oldest past turns', () => {
    const messages = [sys, past(1), past(2), { role: 'user' as const, content: 'q' }]
    const result = compact(messages, { ...LIMITS, contextBudgetTokens: 120 })!
    expect(result.messages.filter(m => m.kind === 'history').map(m => m.content.slice(-1))).toEqual(['2'])
  })

  test('then cuts recent tool results harder', () => {
    const result = compact([sys, obs(1, 1500)], { ...LIMITS, contextBudgetTokens: 100 })!
    expect(result.messages[1].content).toContain(`[truncated`)
    expect(result.messages[1].content.length).toBeLessThan(LIMITS.maxObservationChars / 2)
    expect(result.messages[1].content.endsWith('</tool_result>')).toBe(true)
  })
})
