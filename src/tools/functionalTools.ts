// Functional tools: no run of their own, the harness acts on them (harness/loop.ts, harness/toolCall.ts).

import { z } from 'zod'
import { TOOL } from '../prompts'
import type { FunctionalTool } from './tool'

// Ends the loop; the harness writes the final reply.
export const finishAndReply: FunctionalTool = {
  kind: 'functional',
  name: 'finish_and_reply',
  description: TOOL.finishAndReply,
  args: z.object({})
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
