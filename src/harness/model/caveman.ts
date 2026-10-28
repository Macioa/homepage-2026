// The model rewrites text caveman before the agent loop reads it: the visitor's prompt at the start of
// each turn (an extra model call), past answers once each. Every token in context is read again on each
// step, so shorter is faster. Only the final answer, written for the visitor, stays in full sentences.

import type { Msg } from '../state/types'
import type { Model } from './adapter'

// Framed as deleting words, not as a persona: told "You are Caveman Mode", the 1B model role-plays a
// caveman ("Ugga, me Og") or answers the question instead of rewriting it.
export const CAVEMAN_SYSTEM =
  'You delete words from text. Talk in brief fragments. ' +
  'Strip all introductory fluff, pleasantries, and conversational filler. ' +
  'Keep every other word exactly as written, in order. Questions stay questions. Never answer the text, never add words.'

export const CAVEMAN_REQUEST = 'Delete filler: '
const request = (text: string) => CAVEMAN_REQUEST + JSON.stringify(text)

// A 1B model copies examples better than it follows rules: a question, a request, an answer.
const EXAMPLES: [string, string][] = [
  ['Hi! Can you tell me where Ryan went to school?', 'where Ryan went to school?'],
  [
    'Hey, could you please send Ryan a message that I want to hire him? I am Sam from Acme.',
    'send Ryan message: I want to hire him. I am Sam from Acme.'
  ],
  [
    'Ryan spent three years at a fintech startup, where he led the team that rebuilt the payments dashboard.',
    'Ryan spent three years at fintech startup, led team, rebuilt payments dashboard.'
  ]
]

const words = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []

// A rewrite mostly deletes: few new words (room for "building" -> "built"), not longer, a question
// still a question. Anything else means the model answered the text or made something up (checked
// here, since a 1B model ignores the rule).
function isRewrite(original: string, short: string) {
  const source = new Set(words(original))
  const used = words(short)
  const kept = used.filter(word => source.has(word)).length
  return (
    used.length > 0 &&
    short.length <= original.length &&
    kept >= used.length * 0.8 &&
    (!original.includes('?') || short.includes('?'))
  )
}

// Resolves to the caveman version of text, or text itself when it's too short to shorten or the
// model's reply isn't a faithful rewrite.
export async function caveman(model: Model, text: string, maxTokens: number) {
  if (words(text).length <= 3) return text
  const messages: Msg[] = [
    { role: 'system', content: CAVEMAN_SYSTEM },
    ...EXAMPLES.flatMap(([long, short]): Msg[] => [
      { role: 'user', content: request(long) },
      { role: 'assistant', content: short }
    ]),
    { role: 'user', content: request(text) }
  ]
  const short = (await model.complete(messages, { maxTokens })).trim()
  return isRewrite(text, short) ? short : text
}
