import { configureStore, createSlice } from '@reduxjs/toolkit'
import { authReducer, startChatAuth } from './auth'
import { harnessReducer } from './harness'

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
  reducer: { ui: ui.reducer, auth: authReducer, harness: harnessReducer }
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

// Chat JWT on app load, refreshed before it expires (skipped under tests).
if (import.meta.env.MODE !== 'test') startChatAuth(store.dispatch)

if (import.meta.env.DEV) Object.assign(window, { store })
