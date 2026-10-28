// Write-ahead journal of the current turn's tool calls, kept outside Redux so it survives a page
// reload (the app reloads on GPU failure, possibly mid-turn). Saved after every harness action, so a
// call is on record as "started" before its tool runs. No results: just enough to reconcile after a crash.

import { reloadStore } from '../llm/storage.js'
import type { Call, Prompt, Session } from './state/types'

const KEY = 'harness:journal:v2'

export type JournalStore = {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

export type JournalEntry = {
  turnId: string
  prompt: Prompt
  status: Session['status']
  calls: Pick<Call, 'id' | 'tool' | 'args' | 'idempotencyKey' | 'status'>[]
}

export type Journal = ReturnType<typeof createJournal>

export function createJournal(store: JournalStore = reloadStore) {
  return {
    save(session: Session) {
      if (!session.turnId) return
      const calls = Object.values(session.tools)
        .flat()
        .map(({ id, tool, args, idempotencyKey, status }) => ({ id, tool, args, idempotencyKey, status }))
      const entry: JournalEntry = { turnId: session.turnId, prompt: session.prompt, status: session.status, calls }
      store.set(KEY, JSON.stringify(entry))
    },
    load(): JournalEntry | null {
      try {
        return JSON.parse(store.get(KEY) ?? 'null')
      } catch {
        return null
      }
    }
  }
}
