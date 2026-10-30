// Run failures the harness handles itself. A failed Supabase connection ends the run with a fixed reply that
// never goes through the LLM; Gemini's usage limit locks Send for 30 seconds (state/usage.ts) and fails the run.

import { UsageLimitError } from '../connections/gemini'
import { DataAccessError } from '../connections/supabase'
import { lockSend } from '../state/usage'
import type { Run } from './run'

const DATA_ACCESS_REPLY = 'Could not access data'

type Failure = 'data_access' | 'usage_limit' | 'other'

function failureOf(error: unknown): Failure {
  if (error instanceof DataAccessError) return 'data_access'
  if (error instanceof UsageLimitError) return 'usage_limit'
  return 'other'
}

// The run's reply for a handled failure; anything else is rethrown.
export function handleFailure(error: unknown, { store }: Run): string {
  switch (failureOf(error)) {
    case 'data_access':
      return DATA_ACCESS_REPLY
    case 'usage_limit':
      store.dispatch(lockSend())
      throw error
    case 'other':
      throw error
  }
}
