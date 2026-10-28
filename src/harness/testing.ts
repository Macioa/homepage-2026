// Test helpers: a scripted model, in-memory storage, test tools and a harness on a fresh store.
// Not imported by the app.

import { configureStore } from '@reduxjs/toolkit'
import { z } from 'zod'
import type { Limits } from './config'
import { createHarness } from '.'
import { createJournal, type Journal, type JournalStore } from './journal'
import type { Model } from './model/adapter'
import { CAVEMAN_REQUEST, CAVEMAN_SYSTEM } from './model/caveman'
import { harnessReducer } from './state/slice'
import { createTrace } from './state/trace'
import type { Msg, Prompt } from './state/types'
import { defineTool, type Tool } from './tools'

export const toolCall = (tool: string, args: object = {}) => ({ type: 'tool', tool, args })
export const final = (answer: string, used: string[] = []) => ({ type: 'final', answer, used })
export const asPrompt = (original: string, caveman = original): Prompt => ({ original, caveman })

// A reply: an object (sent as JSON), a raw string, or a function for custom behavior (hang, throw).
export type Reply = object | string | ((messages: Msg[]) => Promise<string>)

// Stands in for the model's caveman rewrite: drops a few filler words.
const FILLER = /\b(hi|please|could you|tell me)\b[,!]?\s*/gi
export const dropFiller = async (text: string) => text.replace(FILLER, '').trim()

// Replies in order, repeating the last one. Records every context and schema it was sent.
// Caveman rewrites (the turn's first step) go to `caveman` instead and are recorded in `rewrites`, so
// `seen` and `schemas` hold only the loop's calls.
export function scripted(
  replies: Reply[],
  caveman: (text: string) => Promise<string> = dropFiller
): Model & { seen: Msg[][]; schemas: string[]; rewrites: string[]; stops: number } {
  const model = {
    seen: [] as Msg[][],
    schemas: [] as string[],
    rewrites: [] as string[],
    stops: 0,
    async complete(messages: Msg[], { schema }: { schema?: string }) {
      if (messages[0].content === CAVEMAN_SYSTEM) {
        const text = JSON.parse(messages.at(-1)!.content.slice(CAVEMAN_REQUEST.length))
        model.rewrites.push(text)
        return caveman(text)
      }
      model.seen.push(structuredClone(messages))
      model.schemas.push(schema!)
      const reply = replies[Math.min(model.seen.length, replies.length) - 1]
      if (typeof reply === 'function') return reply(messages)
      return typeof reply === 'string' ? reply : JSON.stringify(reply)
    },
    stop() {
      model.stops++
    }
  }
  return model
}

export const hang = () => new Promise<string>(() => {})

export function memoryStore(): JournalStore {
  const map = new Map<string, string>()
  return { get: key => map.get(key) ?? null, set: (key, value) => map.set(key, value), remove: key => map.delete(key) }
}

export function makeStore() {
  const trace = createTrace()
  const store = configureStore({
    reducer: { harness: harnessReducer },
    middleware: getDefault => getDefault({ immutableCheck: false, serializableCheck: false }).concat(trace.middleware)
  })
  return { store, trace }
}

export function setup(
  replies: Reply[],
  tools: Tool[],
  options: {
    journal?: Journal
    limits?: Partial<Limits>
    model?: Model
    caveman?: (text: string) => Promise<string>
  } = {}
) {
  const { store, trace } = makeStore()
  const model = scripted(replies, options.caveman)
  const journal = options.journal ?? createJournal(memoryStore())
  const harness = createHarness({
    store,
    model: options.model ?? model,
    tools,
    journal,
    limits: { toolTimeoutMs: 50, ...options.limits }
  })
  return {
    harness,
    model,
    trace,
    actions: trace.actions,
    journal,
    store,
    session: () => store.getState().harness.session,
    history: () => store.getState().harness.history
  }
}

export const search = defineTool({
  name: 'search',
  description: 'search',
  args: z.object({ query: z.string() }),
  async run({ query }) {
    return { hits: [`Ryan used ${query}`] }
  }
})

// A side-effect tool backed by a shared fake outbox, so a "second page" can see what the first one did.
export function sendTool(
  outbox: Map<string, string>,
  { hang: hangs = 'never' as 'never' | 'first' | 'always', verifies = true } = {}
) {
  const stats = { runs: 0 }
  const tool = defineTool({
    name: 'send',
    description: 'send message',
    args: z.object({ message: z.string() }),
    sideEffect: true,
    offerIf: prompt => /\btell ryan\b/i.test(prompt.original),
    async run({ message }, { idempotencyKey }) {
      stats.runs++
      if (!outbox.has(idempotencyKey)) outbox.set(idempotencyKey, message)
      // The side effect happened; the response never arrives.
      if (hangs === 'always' || (hangs === 'first' && stats.runs === 1)) await hang()
      return { delivered: true }
    },
    async verify(_args, _result, { idempotencyKey }) {
      return verifies && outbox.has(idempotencyKey)
    }
  })
  return { tool, stats }
}
