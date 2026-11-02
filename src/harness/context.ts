// The LLM context: messages in LangChain's stored format, a cleared context with the chat memory, and the
// reset_context reload.

import { z } from 'zod'
import type { ModelRequest, StoredMessage, ToolCall } from '../connections/gemini'
import * as PROMPTS from '../prompts'
import { selectStateKeys, selectStateValues } from '../state/harness'
import { selectHistory, type HistoryEntry } from '../state/history'
import { toToolSpec } from '../tools'
import { callLoggedModel, type Run } from './run'

const SELECT_TOOL_NAME = 'select_keys'
const SELECT_TOOL_CHOICE = 'any'

// The messages sent on the next model call.
export type Context = StoredMessage[]

export const systemMessage = (content: string): StoredMessage => ({ type: 'system', data: { content } })

export const humanMessage = (content: string): StoredMessage => ({ type: 'human', data: { content } })

export const aiMessage = (content: string): StoredMessage => ({ type: 'ai', data: { content } })

export const toolMessage = ({ id, name }: ToolCall, content: string): StoredMessage => ({
  type: 'tool',
  data: { content, tool_call_id: id, name }
})

// Chat memory as turns: the visitor's prompts as human messages, the final responses as the model's.
const historyMessage = ({ label, text }: HistoryEntry) => (label === 'prompt' ? humanMessage(text) : aiMessage(text))

// A cleared context: the system prompt, the chat memory, then one message.
export const freshContext = (content: string, history: HistoryEntry[] = []): Context => [
  systemMessage(PROMPTS.SYSTEM),
  ...history.map(historyMessage),
  humanMessage(content)
]

const selectTool = (keys: string[]) =>
  toToolSpec({
    name: SELECT_TOOL_NAME,
    description: PROMPTS.TOOL.selectKeys,
    args: z.object({ keys: z.array(z.enum(keys as [string, ...string[]])).describe(PROMPTS.TOOL_ARG.keys) })
  })

const readKeys = (call?: ToolCall) => (call?.args.keys as string[] | undefined) ?? []

// In a cleared context, the LLM picks which state keys to load, through a forced select_keys call.
async function selectKeys(keys: string[], run: Run) {
  const request: ModelRequest = { messages: freshContext(PROMPTS.selectKeys(keys)), tools: [selectTool(keys)], toolChoice: SELECT_TOOL_CHOICE }
  const { toolCalls: [call] } = await callLoggedModel(request, run)
  return readKeys(call)
}

// reset_context: drops the context and starts a new one with the chat memory and the values of the keys the LLM chose.
export async function reloadContext(run: Run) {
  const { store } = run
  const chosen = await selectKeys(selectStateKeys(store.getState()), run)
  return freshContext(JSON.stringify(selectStateValues(store.getState(), chosen)), selectHistory(store.getState()))
}
