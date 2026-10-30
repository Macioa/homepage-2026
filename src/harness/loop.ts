// The tool loop: one model turn with every tool, its calls run, then the next step. Repeats until
// finish_and_reply, whose reply arg is the final reply, or a second no_appropriate_tool, which has the
// final reply written in one more call. off_topic_question
// cancels the loop at once with a fixed reply.

import type { ToolCall } from '../connections/gemini'
import * as PROMPTS from '../prompts'
import type { RootState } from '../state'
import { selectToolCall } from '../state/harness'
import { finishAndReply, noAppropriateTool, offTopicQuestion, resetContext, TOOL_INDEX, TOOL_SPECS } from '../tools'
import { humanMessage, reloadContext, type Context } from './context'
import { callLoggedModel, type Run } from './run'
import { parseArgs, runToolCalls, toCallKey } from './toolCall'

// The model must call a tool every turn; the loop only ends through finish_and_reply or no_appropriate_tool.
const LOOP_TOOL_CHOICE = 'any'
// The final reply: tools declared (the context holds tool calls) but disabled.
const FINAL_TOOL_CHOICE = 'none'
// off_topic_question's reply, shown as is; never sent to the LLM.
const OFF_TOPIC_REPLY = "That's not what i'm here for"

type Action = 'off_topic' | 'finish_and_reply' | 'reset_context' | 'no_tool_call' | 'continue'

// no_appropriate_tool selected before (in state) or twice this turn.
function secondNoAppropriateTool(toolCalls: ToolCall[], state: RootState) {
  const calls = toolCalls.filter(({ name }) => name === noAppropriateTool.name)
  const inState = calls.some(call => selectToolCall(state, toCallKey(call)))
  return calls.length + Number(inState) >= 2
}

// off_topic_question wins over everything; finish_and_reply (or a second no_appropriate_tool) wins over
// reset_context. Reads state from before the turn's calls run.
function pickAction(toolCalls: ToolCall[], state: RootState): Action {
  const names = toolCalls.map(({ name }) => name)
  if (!names.length) return 'no_tool_call'
  if (names.includes(offTopicQuestion.name)) return 'off_topic'
  if (names.includes(finishAndReply.name) || secondNoAppropriateTool(toolCalls, state)) return 'finish_and_reply'
  if (names.includes(resetContext.name)) return 'reset_context'
  return 'continue'
}

// finish_and_reply's reply, if it can stand as the final reply: non-empty, and its turn fetched no data
// (a reply written alongside data calls was written before their results).
function finishedReply(toolCalls: ToolCall[]) {
  const reply = toolCalls.find(({ name }) => name === finishAndReply.name)?.args.reply
  const fetchedData = toolCalls.some(({ name }) => TOOL_INDEX[name]?.kind !== 'functional')
  return typeof reply === 'string' && reply.trim() && !fetchedData ? reply : null
}

async function takeTurn(context: Context, run: Run) {
  const { message, toolCalls: sent } = await callLoggedModel({ messages: context, tools: TOOL_SPECS, toolChoice: LOOP_TOOL_CHOICE }, run)
  const toolCalls = sent.map(parseArgs)
  const action = pickAction(toolCalls, run.store.getState())
  // An off-topic turn runs none of its calls.
  const results = action === 'off_topic' ? [] : await runToolCalls(toolCalls, run)
  return { action, toolCalls, context: [...context, message, ...results] }
}

async function writeFinalReply(context: Context, run: Run) {
  const { text } = await callLoggedModel({ messages: context, tools: TOOL_SPECS, toolChoice: FINAL_TOOL_CHOICE }, run)
  return text
}

export async function toolLoop(context: Context, run: Run): Promise<string> {
  run.signal.throwIfAborted()
  const turn = await takeTurn(context, run)
  switch (turn.action) {
    case 'off_topic':
      return OFF_TOPIC_REPLY
    case 'finish_and_reply':
      return finishedReply(turn.toolCalls) ?? writeFinalReply(turn.context, run)
    case 'reset_context':
      return toolLoop(await reloadContext(run), run)
    case 'no_tool_call':
      return toolLoop([...turn.context, humanMessage(PROMPTS.NO_TOOL_CALL)], run)
    case 'continue':
      return toolLoop(turn.context, run)
  }
}
