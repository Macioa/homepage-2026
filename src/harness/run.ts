// A harness run: the store and one abort signal for the user's stop or the timeout.

import type { AppDispatch, RootState } from '../state'

const HARNESS_TIMEOUT_MS = 60_000

export type HarnessStore = { dispatch: AppDispatch; getState: () => RootState }

export type Run = { store: HarnessStore; signal: AbortSignal }

const withTimeout = (signal: AbortSignal) => AbortSignal.any([signal, AbortSignal.timeout(HARNESS_TIMEOUT_MS)])

export const createRun = (store: HarnessStore, signal: AbortSignal): Run => ({ store, signal: withTimeout(signal) })
