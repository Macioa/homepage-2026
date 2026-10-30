// Tool calls: each one to its tool message. Data tool results are saved under toolCalls[`tool(args)`],
// failed or not; a repeat of a succeeded call is refused, a repeat of a failed one runs and replaces it.
// A failed Supabase connection aborts the run.

import type { StoredMessage, ToolCall } from '../connections/gemini'
import { DataAccessError } from '../connections/supabase'
import * as PROMPTS from '../prompts'
import type { RootState } from '../state'
import { saveToolCall, selectToolCall, type ToolCallRecord } from '../state/harness'
import { finishAndReply, noAppropriateTool, TOOL_INDEX, type ToolContext } from '../tools'
import { toolMessage } from './context'
import type { Run } from './run'

// functional: steers the loop. duplicate: same tool and args already succeeded. run: anything else,
// including a retry of a failed call and an unknown tool (which fails when run).
type CallKind = 'functional' | 'duplicate' | 'run'

// The toolCalls state key for a call: tool(args), e.g. get_skill({"skill":"React","mode":"precise"}).
export const toCallKey = ({ name, args }: ToolCall) => `${name}(${JSON.stringify(args)})`

// The call with its args as the tool's zod schema parses them: declared keys only, in declared order, so the
// same call always has the same key. Invalid args (or an unknown tool) stay as sent and fail when run.
export function parseArgs(call: ToolCall): ToolCall {
  const parsed = TOOL_INDEX[call.name]?.args.safeParse(call.args)
  return parsed?.success ? { ...call, args: parsed.data } : call
}

function classifyCall(call: ToolCall, state: RootState): CallKind {
  if (TOOL_INDEX[call.name]?.kind === 'functional') return 'functional'
  return selectToolCall(state, toCallKey(call))?.ok ? 'duplicate' : 'run'
}

// The data tool's context: the chat JWT as redux holds it now (a refreshed token is used) and the run's signal.
const toolContext = ({ store, signal }: Run): ToolContext => ({ token: store.getState().auth.token, signal })

async function runDataTool({ name, args }: ToolCall, ctx: ToolContext) {
  const tool = TOOL_INDEX[name]
  if (tool?.kind !== 'data') throw new Error(PROMPTS.unknownTool(name))
  return tool.run(tool.args.parse(args), ctx)
}

// Saves the record under toolCalls (a retry replaces it) and returns it as the tool message text.
function saveRecord(call: ToolCall, record: ToolCallRecord, { store }: Run) {
  store.dispatch(saveToolCall({ key: toCallKey(call), ...record }))
  return JSON.stringify(record)
}

// Runs the call and saves its record, failed or not; a failure's result is its error message. A failed
// Supabase connection is saved, then rethrown to abort the run (harness/failure.ts).
async function executeCall(call: ToolCall, run: Run) {
  try {
    return saveRecord(call, { ok: true, result: await runDataTool(call, toolContext(run)) }, run)
  } catch (error) {
    const failed = saveRecord(call, { ok: false, result: (error as Error).message }, run)
    if (error instanceof DataAccessError) throw error
    return failed
  }
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
      // reset_context: never sent, the reset replaces the whole context. off_topic_question: never run (loop.ts).
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
