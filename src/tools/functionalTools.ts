// Functional tools: no run of their own, the harness acts on them (harness/loop.ts, harness/toolCall.ts).

import { z } from 'zod'
import { TOOL, TOOL_ARG } from '../prompts'
import type { FunctionalTool } from './tool'

// Ends the loop with the final reply as its arg. If the reply can't be used (see harness/loop.ts), the harness writes it.
export const finishAndReply: FunctionalTool = {
  kind: 'functional',
  name: 'finish_and_reply',
  description: TOOL.finishAndReply,
  args: z.object({ reply: z.string().describe(TOOL_ARG.reply) })
}

// Clears the context; the harness lets the LLM pick which state to load back.
export const resetContext: FunctionalTool = {
  kind: 'functional',
  name: 'reset_context',
  description: TOOL.resetContext,
  args: z.object({})
}

// First select: saved to state, the loop continues. Second select: ends the loop and writes the final reply.
export const noAppropriateTool: FunctionalTool = {
  kind: 'functional',
  name: 'no_appropriate_tool',
  description: TOOL.noAppropriateTool,
  args: z.object({})
}

// Ends the run at once: the turn's other calls are skipped and the reply is fixed, not the LLM's.
export const offTopicQuestion: FunctionalTool = {
  kind: 'functional',
  name: 'off_topic_question',
  description: TOOL.offTopicQuestion,
  args: z.object({})
}
