// Init: save the prompt, have the LLM reduce it to minimal language, save the reduction (both under `prompt`).

import { callModel } from '../connections/gemini'
import * as PROMPTS from '../prompts'
import { clearHarness, savePrompt, saveReducedPrompt } from '../state/harness'
import { humanMessage } from './context'
import type { Run } from './run'

// The reduction runs in its own context, apart from the loop.
async function reducePrompt(prompt: string, signal: AbortSignal) {
  const { text } = await callModel({ messages: [humanMessage(PROMPTS.reduce(prompt))] }, signal)
  return text
}

export async function initPrompt(prompt: string, { store, signal }: Run) {
  store.dispatch(clearHarness())
  store.dispatch(savePrompt(prompt))
  const reduced = await reducePrompt(prompt, signal)
  store.dispatch(saveReducedPrompt(reduced))
  return reduced
}
