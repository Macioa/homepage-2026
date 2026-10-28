// What the model sees of tool results, and keeping its context inside the token budget.
// Full results always stay in session.tools; only the model's copy is cut down.

import { estimateTokens } from '../../llm/prefillTiming.js'
import type { Limits } from '../config'
import type { Call, Msg } from '../state/types'

// Tool output can't open or close a <tool_result> block of its own.
const TAG = /<(\/?)tool_result/gi

const truncate = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max)}…[truncated ${text.length - max} chars]`

const body = (call: Call) => {
  if (call.status !== 'ok') return `Error: ${call.error}`
  return typeof call.result === 'string' ? call.result : JSON.stringify(call.result)
}

export function observation(call: Call, limits: Limits): Msg {
  const content = truncate(body(call).replace(TAG, '&lt;$1tool_result'), limits.maxObservationChars)
  return {
    role: 'user',
    kind: 'observation',
    callId: call.id,
    content: `<tool_result call="${call.id}" status="${call.status}">\n${content}\n</tool_result>`
  }
}

export const countTokens = (messages: Msg[]) =>
  messages.reduce((sum, message) => sum + estimateTokens(message.content), 0)

// Rewrites an observation's body, keeping its opening tag (call id + status) and closing tag.
function rewriteBody(message: Msg, fn: (text: string) => string): Msg {
  const lines = message.content.split('\n')
  const inner = lines.slice(1, -1).join('\n')
  return { ...message, content: [lines[0], fn(inner), lines.at(-1)].join('\n') }
}

// Shrinks the context to fit the budget, cheapest losses first. Returns null when it already fits.
// Only runs when needed: WebLLM reuses its cache while messages only grow, and a rewrite means reading everything again.
export function compact(messages: Msg[], limits: Limits) {
  const before = countTokens(messages)
  const fits = (list: Msg[]) => countTokens(list) <= limits.contextBudgetTokens
  if (fits(messages)) return null

  // 1. Older tool results become stubs. The call id stays, so the model can still cite them.
  const observations = messages.flatMap((m, i) => (m.kind === 'observation' ? [i] : []))
  const old = new Set(observations.slice(0, -limits.keepRecentObservations))
  let out = messages.map((m, i) => (old.has(i) ? rewriteBody(m, () => '[compacted: full result kept in memory]') : m))

  // 2. Drop past turns, oldest first.
  while (!fits(out) && out.some(m => m.kind === 'history')) {
    const oldest = out.findIndex(m => m.kind === 'history')
    out = out.filter((_, i) => i !== oldest)
  }

  // 3. Cut the recent tool results harder.
  if (!fits(out)) {
    const max = Math.floor(limits.maxObservationChars / 4)
    out = out.map(m => (m.kind === 'observation' ? rewriteBody(m, text => truncate(text, max)) : m))
  }

  return { messages: out, before, after: countTokens(out) }
}
