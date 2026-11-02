// Chat memory: each exchange is saved as a labeled prompt and response; only the last 3 of each are kept.

import { expect, test } from 'vitest'
import { HISTORY_LIMIT, historyReducer, saveExchange, type HistoryEntry } from './history'

const save = (state: HistoryEntry[], n: number) => historyReducer(state, saveExchange({ prompt: `p${n}`, response: `r${n}` }))

test('an exchange is a labeled prompt then response', () => {
  expect(save([], 1)).toEqual([
    { label: 'prompt', text: 'p1' },
    { label: 'response', text: 'r1' }
  ])
})

test('keeps the last 3 prompts and 3 responses, oldest first', () => {
  const state = [1, 2, 3, 4, 5].reduce(save, [])
  expect(HISTORY_LIMIT).toBe(3)
  expect(state.map(({ text }) => text)).toEqual(['p3', 'r3', 'p4', 'r4', 'p5', 'r5'])
})
