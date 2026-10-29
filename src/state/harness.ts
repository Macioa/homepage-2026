// Harness run state: the prompt (original + reduced) and every tool call result keyed `tool(args)`.

import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export type ToolCallRecord = { ok: boolean; result: unknown }

export type HarnessState = {
  prompt: { original: string | null; reduced: string | null }
  toolCalls: Record<string, ToolCallRecord>
}

type HarnessRoot = { harness: HarnessState }

const initialState: HarnessState = { prompt: { original: null, reduced: null }, toolCalls: {} }

const harness = createSlice({
  name: 'harness',
  initialState,
  reducers: {
    clearHarness: () => initialState,
    savePrompt: (state, { payload }: PayloadAction<string>) => {
      state.prompt.original = payload
    },
    saveReducedPrompt: (state, { payload }: PayloadAction<string>) => {
      state.prompt.reduced = payload
    },
    saveToolCall: (state, { payload: { key, ok, result } }: PayloadAction<{ key: string } & ToolCallRecord>) => {
      state.toolCalls[key] = { ok, result }
    }
  }
})

export const { clearHarness, savePrompt, saveReducedPrompt, saveToolCall } = harness.actions
export const harnessReducer = harness.reducer

export const selectToolCall = ({ harness }: HarnessRoot, key: string) => harness.toolCalls[key]

// The state as flat keys: prompt.original, prompt.reduced, toolCalls.<tool(args)>.
const flattenState = ({ harness: { prompt, toolCalls } }: HarnessRoot): Record<string, unknown> => ({
  'prompt.original': prompt.original,
  'prompt.reduced': prompt.reduced,
  ...Object.fromEntries(Object.entries(toolCalls).map(([key, record]) => [`toolCalls.${key}`, record]))
})

export const selectStateKeys = (state: HarnessRoot) => Object.keys(flattenState(state))

export const selectStateValues = (state: HarnessRoot, keys: string[]) => {
  const flat = flattenState(state)
  return Object.fromEntries(keys.filter(key => key in flat).map(key => [key, flat[key]]))
}
