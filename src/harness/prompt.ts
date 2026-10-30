// Init: save the prompt, have the LLM reduce it to minimal language, save the reduction (both under `prompt`).

import * as PROMPTS from '../prompts'
import { clearHarness, savePrompt, saveReducedPrompt } from '../state/harness'
import { humanMessage } from './context'
import { callLoggedModel, type Run } from './run'

// The reduction runs in its own context, apart from the loop.
async function reducePrompt(prompt: string, run: Run) {
  const { text } = await callLoggedModel({ messages: [humanMessage(PROMPTS.reduce(prompt))] }, run)
  return text
}

export async function initPrompt(prompt: string, run: Run) {
  const { store } = run
  store.dispatch(clearHarness())
  store.dispatch(savePrompt(prompt))
  const reduced = await reducePrompt(prompt, run)
  store.dispatch(saveReducedPrompt(reduced))
  return reduced
}
