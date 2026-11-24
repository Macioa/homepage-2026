// Model call log: the last MAX_RECORDS model calls, oldest first, each with its provider, the model that answered,
// the tool choice, and the raw reply (text and tool calls, finish_and_reply and off_topic_question included) or error.

import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { ModelProvider, ModelReply, ToolCall, ToolChoice } from '../connections/gemini'

const MAX_RECORDS = 100

export type ModelCallRecord = {
  at: number // client ms when the call started
  ms: number
  provider: ModelProvider
  model: string | null // null when the call failed before a model answered
  toolChoice: ToolChoice | null
  toolCalls: ToolCall[]
  text: string
  error: string | null
}

type ModelCallOptions = { provider: ModelProvider; toolChoice?: ToolChoice; startedAt: number } & ({ reply: ModelReply } | { error: unknown })

const initialState: ModelCallRecord[] = []

const modelCalls = createSlice({
  name: 'modelCalls',
  initialState,
  reducers: {
    // Drops the oldest past MAX_RECORDS.
    recordModelCall: {
      reducer: (state, { payload }: PayloadAction<ModelCallRecord>) => {
        state.push(payload)
        state.splice(0, Math.max(state.length - MAX_RECORDS, 0))
      },
      prepare: ({ provider, toolChoice, startedAt, ...outcome }: ModelCallOptions) => {
        const reply = 'reply' in outcome ? outcome.reply : null
        const error = 'error' in outcome ? (outcome.error as Error).message : null
        const payload: ModelCallRecord = {
          at: startedAt,
          ms: Date.now() - startedAt,
          provider,
          model: reply?.model ?? null,
          toolChoice: toolChoice ?? null,
          toolCalls: reply?.toolCalls ?? [],
          text: reply?.text ?? '',
          error
        }
        return { payload }
      }
    }
  }
})

export const { recordModelCall } = modelCalls.actions
export const modelCallsReducer = modelCalls.reducer
