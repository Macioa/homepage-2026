// Harness: a tool loop.
//   init     save the prompt to redux, have the LLM reduce it to minimal language, save that too (both under `prompt`)
//   start    clear the context and give the LLM the reduced prompt
//   loop     each tool result is saved under toolCalls[`tool(args)`], failed or not; a repeat of a
//            succeeded call is refused, a repeat of a failed one runs again and replaces it
//   tools    reset_context clears the context and lets the LLM choose which redux keys to load
//            no_appropriate_tool goes to state and the loop continues; selected again, it ends the loop
//            finish_and_reply ends the loop and generates the final response
//   timeout  the whole run aborts after HARNESS_TIMEOUT_MS

import { freshContext } from './context'
import { toolLoop } from './loop'
import { initPrompt } from './prompt'
import { createRun, type HarnessStore } from './run'

type HarnessInput = { prompt: string; store: HarnessStore; signal: AbortSignal }

export async function runHarness({ prompt, store, signal }: HarnessInput) {
  const run = createRun(store, signal)
  const reduced = await initPrompt(prompt, run)
  return toolLoop(freshContext(reduced), run)
}
