// runHarness memory: a run's prompt and final response are saved to history and sent, as human and ai turns
// between the system prompt and the new prompt, on the next run. A stopped run saves nothing.

import { configureStore } from '@reduxjs/toolkit'
import { beforeEach, expect, test, vi } from 'vitest'
import type { ModelReply, ModelRequest } from '../connections/gemini'
import { harnessReducer } from '../state/harness'
import { historyReducer } from '../state/history'
import { runHarness } from '.'
import { callLoggedModel, type HarnessStore } from './run'

vi.mock('./run', async importOriginal => ({ ...(await importOriginal<object>()), callLoggedModel: vi.fn() }))

const model = vi.mocked(callLoggedModel)
let store: HarnessStore

beforeEach(() => {
  model.mockReset()
  store = configureStore({ reducer: { harness: harnessReducer, history: historyReducer, auth: () => ({ token: null }) } }) as unknown as HarnessStore
})

const finish = (reply: string): ModelReply => ({
  message: { type: 'ai', data: {} },
  text: '',
  toolCalls: [{ id: reply, name: 'finish_and_reply', args: { reply } }]
})
const live = () => new AbortController().signal
const sent = (call: number) => (model.mock.calls[call][0] as ModelRequest).messages.map(({ type, data }) => [type, data.content])

test('the next run gets the last exchange between the system prompt and the new prompt', async () => {
  model.mockResolvedValueOnce(finish('Ryan knows React.')).mockResolvedValueOnce(finish('Since 2015.'))
  await runHarness({ prompt: 'top skill?', store, signal: live() })
  await runHarness({ prompt: 'how long?', store, signal: live() })
  expect(sent(1).slice(1)).toEqual([
    ['human', 'top skill?'],
    ['ai', 'Ryan knows React.'],
    ['human', 'how long?']
  ])
  expect(store.getState().history).toEqual([
    { label: 'prompt', text: 'top skill?' },
    { label: 'response', text: 'Ryan knows React.' },
    { label: 'prompt', text: 'how long?' },
    { label: 'response', text: 'Since 2015.' }
  ])
})

test('a stopped run saves nothing', async () => {
  const stop = new AbortController()
  stop.abort(new Error('stopped'))
  model.mockResolvedValue(finish('unused'))
  await expect(runHarness({ prompt: 'q', store, signal: stop.signal })).rejects.toThrow()
  expect(store.getState().history).toEqual([])
})
