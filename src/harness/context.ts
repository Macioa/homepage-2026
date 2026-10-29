// The LLM context: messages in LangChain's stored format, a cleared context, and the reset_context reload.

import { z } from 'zod'
import { callModel, type ModelRequest, type StoredMessage, type ToolCall } from '../connections/gemini'
import * as PROMPTS from '../prompts'
import { selectStateKeys, selectStateValues } from '../state/harness'
import { toToolSpec } from '../tools'
import type { Run } from './run'

const SELECT_TOOL_NAME = 'select_keys'
const SELECT_TOOL_CHOICE = 'any'

// The messages sent on the next model call.
export type Context = StoredMessage[]

export const systemMessage = (content: string): StoredMessage => ({ type: 'system', data: { content } })

export const humanMessage = (content: string): StoredMessage => ({ type: 'human', data: { content } })

export const toolMessage = ({ id, name }: ToolCall, content: string): StoredMessage => ({
  type: 'tool',
  data: { content, tool_call_id: id, name }
})

// A cleared context: the system prompt plus one message.
export const freshContext = (content: string): Context => [systemMessage(PROMPTS.SYSTEM), humanMessage(content)]

const selectTool = (keys: string[]) =>
  toToolSpec({
    name: SELECT_TOOL_NAME,
    description: PROMPTS.TOOL.selectKeys,
    args: z.object({ keys: z.array(z.enum(keys as [string, ...string[]])).describe(PROMPTS.TOOL_ARG.keys) })
  })

const readKeys = (call?: ToolCall) => (call?.args.keys as string[] | undefined) ?? []

// In a cleared context, the LLM picks which state keys to load, through a forced select_keys call.
async function selectKeys(keys: string[], signal: AbortSignal) {
  const request: ModelRequest = { messages: freshContext(PROMPTS.selectKeys(keys)), tools: [selectTool(keys)], toolChoice: SELECT_TOOL_CHOICE }
  const { toolCalls: [call] } = await callModel(request, signal)
  return readKeys(call)
}

// reset_context: drops the context and starts a new one with the values of the keys the LLM chose.
export async function reloadContext({ store, signal }: Run) {
  const chosen = await selectKeys(selectStateKeys(store.getState()), signal)
  return freshContext(JSON.stringify(selectStateValues(store.getState(), chosen)))
}
