// Chat JWT for Supabase (see connections/supabase.ts). Fetched on app load and again a minute
// before it expires.

import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { getChatToken } from '../connections/supabase'
import { onNetworkError } from './networkErrors'

const REFRESH_EARLY_MS = 60_000

export type AuthState = {
  token: string | null
  expiresAt: number | null // unix seconds
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
}

const initialState: AuthState = { token: null, expiresAt: null, status: 'idle', error: null }

export const fetchChatToken = createAsyncThunk('auth/fetchChatToken', (_: void, { dispatch }) => getChatToken(onNetworkError(dispatch)))

const auth = createSlice({
  name: 'auth',
  initialState,
  reducers: {},
  extraReducers: builder => {
    builder
      .addCase(fetchChatToken.pending, state => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(fetchChatToken.fulfilled, (state, { payload }) => {
        state.status = 'ready'
        state.token = payload.token
        state.expiresAt = payload.expires_at
      })
      .addCase(fetchChatToken.rejected, (state, { error }) => {
        state.status = 'error'
        state.error = error.message ?? 'token request failed'
      })
  }
})

export const authReducer = auth.reducer

type Dispatch = (action: ReturnType<typeof fetchChatToken>) => Promise<{ payload?: unknown }>

// The held token, or a new one first when it is missing or expired (e.g. the refresh timer slept).
export async function freshToken(getState: () => { auth: Pick<AuthState, 'token' | 'expiresAt'> }, dispatch: Dispatch) {
  const { token, expiresAt } = getState().auth
  if (token && expiresAt && expiresAt * 1000 > Date.now()) return token
  await dispatch(fetchChatToken())
  return getState().auth.token
}

// Gets a token now and keeps it fresh. Returns a stop function.
export function startChatAuth(dispatch: Dispatch) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const refresh = async () => {
    const { payload } = await dispatch(fetchChatToken())
    const expiresAt = (payload as { expires_at?: number } | undefined)?.expires_at
    const wait = expiresAt ? expiresAt * 1000 - Date.now() - REFRESH_EARLY_MS : REFRESH_EARLY_MS
    timer = setTimeout(refresh, Math.max(wait, 5_000))
  }
  refresh()
  return () => clearTimeout(timer)
}
