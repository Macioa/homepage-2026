// Chat memory: the visitor's last HISTORY_LIMIT prompts and final responses, each labeled, oldest first. Lives in
// this tab's redux store only, so every visitor has their own; a reload starts it empty.

import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

// Prompts kept, and as many responses.
export const HISTORY_LIMIT = 3

export type HistoryEntry = { label: 'prompt' | 'response'; text: string }

export type Exchange = { prompt: string; response: string }

type HistoryRoot = { history: HistoryEntry[] }

const initialState: HistoryEntry[] = []

const history = createSlice({
  name: 'history',
  initialState,
  reducers: {
    // One run's prompt and response, as a labeled pair; drops the oldest pair past HISTORY_LIMIT.
    saveExchange: (state, { payload: { prompt, response } }: PayloadAction<Exchange>) => {
      state.push({ label: 'prompt', text: prompt }, { label: 'response', text: response })
      state.splice(0, Math.max(state.length - HISTORY_LIMIT * 2, 0))
    }
  }
})

export const { saveExchange } = history.actions
export const historyReducer = history.reducer

export const selectHistory = ({ history }: HistoryRoot) => history
