// The one tool with a side effect. The fake outbox is keyed by idempotency key, so a retry or a
// post-crash replay of the same call delivers once. Supabase would dedupe on the same key.

import { z } from 'zod'
import { defineTool } from '../defineTool'
import { sleep } from './fake'

export const outbox = new Map<string, { name: string; message: string }>()

// The visitor asked to reach Ryan: "send him a message", "contact Ryan", "tell Ryan ...".
const CONTACT = /\b(send|message|contact|e-?mail|reach|tell (ryan|him))\b/i

export const sendMessage = defineTool({
  name: 'send_message',
  description: 'send visitor message to Ryan',
  args: z.object({
    name: z.string().describe('visitor name'),
    message: z.string().describe('text for Ryan')
  }),
  sideEffect: true,
  // The visitor's own words: the caveman rewrite is the model's and may drop the cue.
  offerIf: prompt => CONTACT.test(prompt.original),
  async run(args, { idempotencyKey }) {
    await sleep(400)
    if (!outbox.has(idempotencyKey)) outbox.set(idempotencyKey, args)
    return { delivered: true }
  },
  async verify(_args, _result, { idempotencyKey }) {
    await sleep(100)
    return outbox.has(idempotencyKey)
  }
})
