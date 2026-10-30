// Harness: a tool loop.
//   init     save the prompt to redux (under `prompt`); the LLM reduction to minimal language is off (prompt.ts)
//   start    clear the context and give the LLM the prompt
//   loop     each tool result is saved under toolCalls[`tool(args)`], failed or not; a repeat of a
//            succeeded call is refused, a repeat of a failed one runs again and replaces it
//   tools    reset_context clears the context and lets the LLM choose which redux keys to load
//            no_appropriate_tool goes to state and the loop continues; selected again, it ends the loop
//            finish_and_reply ends the loop; its reply arg is the final response (written in one more call if unusable)
//            off_topic_question cancels the loop; the reply is a fixed message, not the LLM's
//   failure  a failed Supabase connection stops all model calls; the reply is a fixed message, not the LLM's
//            Gemini's usage limit disables Send for 30 seconds
//   timeout  the whole run aborts after HARNESS_TIMEOUT_MS

import { freshContext } from './context'
import { handleFailure } from './failure'
import { toolLoop } from './loop'
import { initPrompt } from './prompt'
import { createRun, type HarnessStore } from './run'

type HarnessInput = { prompt: string; store: HarnessStore; signal: AbortSignal }

export async function runHarness({ prompt, store, signal }: HarnessInput) {
  const run = createRun(store, signal)
  try {
    const reduced = await initPrompt(prompt, run)
    return await toolLoop(freshContext(reduced), run)
  } catch (error) {
    return handleFailure(error, run)
  }
}
