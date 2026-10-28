import { configureStore, createSlice } from '@reduxjs/toolkit'
import { harnessReducer } from '../harness/state/slice'
import { createTrace } from '../harness/state/trace'

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

// Dev only: records each harness action with the state after it (window.harnessTrace.markdown()).
const trace = import.meta.env.DEV ? createTrace() : null

export const store = configureStore({
  reducer: { ui: ui.reducer, harness: harnessReducer },
  middleware: getDefault => (trace ? getDefault().concat(trace.middleware) : getDefault())
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

if (import.meta.env.DEV) Object.assign(window, { store, harnessTrace: trace })
