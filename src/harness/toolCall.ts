// Tool calls: each one to its tool message. Data tool results are saved under toolCalls[`tool(args)`],
// failed or not; a repeat of a succeeded call is refused, a repeat of a failed one runs and replaces it.

import type { StoredMessage, ToolCall } from '../connections/gemini'
import * as PROMPTS from '../prompts'
import type { RootState } from '../state'
import { saveToolCall, selectToolCall, type ToolCallRecord } from '../state/harness'
import { finishAndReply, noAppropriateTool, TOOL_INDEX } from '../tools'
import { toolMessage } from './context'
import type { Run } from './run'

// functional: steers the loop. duplicate: same tool and args already succeeded. run: anything else,
// including a retry of a failed call and an unknown tool (which fails when run).
type CallKind = 'functional' | 'duplicate' | 'run'

// The toolCalls state key for a call: tool(args), e.g. test_search_jobs({"query":"react"}).
export const toCallKey = ({ name, args }: ToolCall) => `${name}(${JSON.stringify(args)})`

function classifyCall(call: ToolCall, state: RootState): CallKind {
  if (TOOL_INDEX[call.name]?.kind === 'functional') return 'functional'
  return selectToolCall(state, toCallKey(call))?.ok ? 'duplicate' : 'run'
}

async function runDataTool({ name, args }: ToolCall) {
  const tool = TOOL_INDEX[name]
  if (tool?.kind !== 'data') throw new Error(PROMPTS.unknownTool(name))
  return tool.run(tool.args.parse(args))
}

// Settles to { ok, result }; a failure's result is its error message.
async function settleCall(call: ToolCall): Promise<ToolCallRecord> {
  try {
    return { ok: true, result: await runDataTool(call) }
  } catch (error) {
    return { ok: false, result: (error as Error).message }
  }
}

async function executeCall(call: ToolCall, { store }: Run) {
  const record = await settleCall(call)
  store.dispatch(saveToolCall({ key: toCallKey(call), ...record }))
  return JSON.stringify(record)
}

// no_appropriate_tool goes to state; the second select ends the loop (see loop.ts), so it gets the final-reply prompt.
function recordNoAppropriateTool(call: ToolCall, { store }: Run) {
  const seen = selectToolCall(store.getState(), toCallKey(call))
  store.dispatch(saveToolCall({ key: toCallKey(call), ok: true, result: null }))
  return seen ? PROMPTS.FINAL_REPLY : PROMPTS.NO_APPROPRIATE_TOOL
}

function functionalResult(call: ToolCall, run: Run) {
  switch (call.name) {
    case finishAndReply.name:
      return PROMPTS.FINAL_REPLY
    case noAppropriateTool.name:
      return recordNoAppropriateTool(call, run)
    default:
      // reset_context: never sent, the reset replaces the whole context.
      return ''
  }
}

async function runToolCall(call: ToolCall, run: Run): Promise<StoredMessage> {
  switch (classifyCall(call, run.store.getState())) {
    case 'functional':
      return toolMessage(call, functionalResult(call, run))
    case 'duplicate':
      return toolMessage(call, PROMPTS.duplicateCall(toCallKey(call)))
    case 'run':
      return toolMessage(call, await executeCall(call, run))
  }
}

// In order, so a repeat within one turn is caught as a duplicate.
export async function runToolCalls(toolCalls: ToolCall[], run: Run) {
  const messages: StoredMessage[] = []
  for (const call of toolCalls) messages.push(await runToolCall(call, run))
  return messages
}
