// Network error history: the last MAX_RECORDS failed external requests (see connections/networkError.ts), oldest first.

import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { NetworkErrorOptions, OnNetworkError } from '../connections/networkError'

const MAX_RECORDS = 100

export type NetworkErrorRecord = Required<NetworkErrorOptions> & { at: number } // at: client ms

const initialState: NetworkErrorRecord[] = []

const networkErrorHistory = createSlice({
  name: 'networkErrorHistory',
  initialState,
  reducers: {
    // One reducer for every source and kind; options left out take their defaults. Drops the oldest past MAX_RECORDS.
    recordNetworkError: {
      reducer: (state, { payload }: PayloadAction<NetworkErrorRecord>) => {
        state.push(payload)
        state.splice(0, Math.max(state.length - MAX_RECORDS, 0))
      },
      prepare: ({ status = null, elapsedMs = null, details = {}, ...options }: NetworkErrorOptions) => ({
        payload: { ...options, status, elapsedMs, details, at: Date.now() }
      })
    }
  }
})

export const { recordNetworkError } = networkErrorHistory.actions
export const networkErrorHistoryReducer = networkErrorHistory.reducer

type Dispatch = (action: ReturnType<typeof recordNetworkError>) => unknown

// The onError a connection takes: records its failure in the history.
export const onNetworkError =
  (dispatch: Dispatch): OnNetworkError =>
  options => {
    dispatch(recordNetworkError(options))
  }
