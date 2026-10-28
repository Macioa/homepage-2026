import { describe, expect, test } from 'vitest'
import type { Msg } from '../state/types'
import type { Model } from './adapter'
import { caveman, CAVEMAN_SYSTEM } from './caveman'

const QUESTION = 'Hello! Would you mind telling me which companies Ryan has worked for?'

function replying(reply: string): Model & { calls: { messages: Msg[]; schema?: string; maxTokens: number }[] } {
  const model = {
    calls: [] as { messages: Msg[]; schema?: string; maxTokens: number }[],
    async complete(messages: Msg[], options: { schema?: string; maxTokens: number }) {
      model.calls.push({ messages, ...options })
      return reply
    },
    stop() {}
  }
  return model
}

describe('caveman', () => {
  test('the model rewrites the text in plain text mode, after the caveman system prompt and examples', async () => {
    const model = replying('  which companies Ryan worked for?\n')

    expect(await caveman(model, QUESTION, 64)).toBe('which companies Ryan worked for?')
    const [{ messages, schema, maxTokens }] = model.calls
    expect(messages[0]).toEqual({ role: 'system', content: CAVEMAN_SYSTEM })
    expect(messages.map(m => m.role)).toEqual(['system', ...Array(3).fill(['user', 'assistant']).flat(), 'user'])
    expect(messages.at(-1)!.content).toBe(`Delete filler: "${QUESTION}"`)
    expect(schema).toBeUndefined()
    expect(maxTokens).toBe(64)
  })

  test('text too short to shorten skips the model', async () => {
    const model = replying('unused')
    expect(await caveman(model, 'His projects?', 64)).toBe('His projects?')
    expect(model.calls).toEqual([])
  })

  test.each([
    ['empty', ''],
    ['longer', `${QUESTION} Sure, here you go.`],
    ['an answer instead of a rewrite', 'Ryan worked for Google.'],
    ['a question turned into a statement', 'Ryan has worked for companies.']
  ])('keeps the original when the reply is %s', async (_, reply) => {
    expect(await caveman(replying(reply), QUESTION, 64)).toBe(QUESTION)
  })
})
