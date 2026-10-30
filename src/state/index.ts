import { configureStore, createSlice } from '@reduxjs/toolkit'
import { authReducer, startChatAuth } from './auth'
import { harnessReducer } from './harness'
import { startUsagePolling, usageReducer } from './usage'

const ui = createSlice({
  name: 'ui',
  initialState: { ready: true },
  reducers: {
    setReady: (state, action: { payload: boolean }) => {
      state.ready = action.payload
    }
  }
})

export const { setReady } = ui.actions

export const store = configureStore({
  reducer: { ui: ui.reducer, auth: authReducer, harness: harnessReducer, usage: usageReducer }
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

// Chat JWT on app load, refreshed before it expires, and the Gemini rate window polled (skipped under tests).
if (import.meta.env.MODE !== 'test') {
  startChatAuth(store.dispatch)
  startUsagePolling(store)
}

if (import.meta.env.DEV) Object.assign(window, { store })
