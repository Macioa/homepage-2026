// The tool loop: one model turn with every tool, its calls run, then the next step. Repeats until
// finish_and_reply, or a second no_appropriate_tool, then writes the final reply.

import { callModel, type ToolCall } from '../connections/gemini'
import * as PROMPTS from '../prompts'
import type { RootState } from '../state'
import { selectToolCall } from '../state/harness'
import { finishAndReply, noAppropriateTool, resetContext, TOOL_SPECS } from '../tools'
import { humanMessage, reloadContext, type Context } from './context'
import type { Run } from './run'
import { runToolCalls, toCallKey } from './toolCall'

// The model must call a tool every turn; the loop only ends through finish_and_reply or no_appropriate_tool.
const LOOP_TOOL_CHOICE = 'any'
// The final reply: tools declared (the context holds tool calls) but disabled.
const FINAL_TOOL_CHOICE = 'none'

type Action = 'finish_and_reply' | 'reset_context' | 'no_tool_call' | 'continue'

// no_appropriate_tool selected before (in state) or twice this turn.
function secondNoAppropriateTool(toolCalls: ToolCall[], state: RootState) {
  const calls = toolCalls.filter(({ name }) => name === noAppropriateTool.name)
  const inState = calls.some(call => selectToolCall(state, toCallKey(call)))
  return calls.length + Number(inState) >= 2
}

// finish_and_reply (or a second no_appropriate_tool) wins over reset_context. Reads state from before the turn's calls run.
function pickAction(toolCalls: ToolCall[], state: RootState): Action {
  const names = toolCalls.map(({ name }) => name)
  if (!names.length) return 'no_tool_call'
  if (names.includes(finishAndReply.name) || secondNoAppropriateTool(toolCalls, state)) return 'finish_and_reply'
  if (names.includes(resetContext.name)) return 'reset_context'
  return 'continue'
}

async function takeTurn(context: Context, run: Run) {
  const { message, toolCalls } = await callModel({ messages: context, tools: TOOL_SPECS, toolChoice: LOOP_TOOL_CHOICE }, run.signal)
  const action = pickAction(toolCalls, run.store.getState())
  const results = await runToolCalls(toolCalls, run)
  return { action, context: [...context, message, ...results] }
}

async function writeFinalReply(context: Context, signal: AbortSignal) {
  const { text } = await callModel({ messages: context, tools: TOOL_SPECS, toolChoice: FINAL_TOOL_CHOICE }, signal)
  return text
}

export async function toolLoop(context: Context, run: Run): Promise<string> {
  run.signal.throwIfAborted()
  const turn = await takeTurn(context, run)
  switch (turn.action) {
    case 'finish_and_reply':
      return writeFinalReply(turn.context, run.signal)
    case 'reset_context':
      return toolLoop(await reloadContext(run), run)
    case 'no_tool_call':
      return toolLoop([...turn.context, humanMessage(PROMPTS.NO_TOOL_CALL)], run)
    case 'continue':
      return toolLoop(turn.context, run)
  }
}
