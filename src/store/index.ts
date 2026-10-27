import { configureStore, createSlice } from '@reduxjs/toolkit'

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

export const store = configureStore({ reducer: { ui: ui.reducer } })

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

if (import.meta.env.DEV) Object.assign(window, { store })
