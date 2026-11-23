// callModel's 429s: Gemini's or the window's locks Send (UsageLimitError); OpenRouter's is outside the window and doesn't.

import { afterEach, expect, test, vi } from 'vitest'
import { callModel, UsageLimitError } from './gemini'

const call = (source: string) => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'limit', source, timeout: false }, { status: 429 })))
  return callModel({ messages: [] }, 'token', new AbortController().signal, vi.fn())
}

afterEach(() => vi.unstubAllGlobals())

test.each(['gemini', 'netlify'])('a %s 429 is the usage limit', async source => {
  await expect(call(source)).rejects.toBeInstanceOf(UsageLimitError)
})

test('an OpenRouter 429 is not', async () => {
  await expect(call('openrouter')).rejects.not.toBeInstanceOf(UsageLimitError)
})
