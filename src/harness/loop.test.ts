// toolLoop: the tool limit. After 9 tool calls the loop ends and the final reply is written in one more
// call (toolChoice 'none'); a turn that reaches the limit runs all its calls; finish_and_reply and
// off_topic_question still end the loop as before.

import { configureStore } from '@reduxjs/toolkit'
import { beforeEach, expect, test, vi } from 'vitest'
import type { ModelReply, ModelRequest, ToolCall } from '../connections/gemini'
import { harnessReducer } from '../state/harness'
import { freshContext } from './context'
import { toolLoop } from './loop'
import { callLoggedModel, type HarnessStore, type Run } from './run'

vi.mock('./run', async importOriginal => ({ ...(await importOriginal<object>()), callLoggedModel: vi.fn() }))

const model = vi.mocked(callLoggedModel)
let run: Run

beforeEach(() => {
  model.mockReset()
  const store = configureStore({ reducer: { harness: harnessReducer, auth: () => ({ token: null }) } })
  run = { store: store as unknown as HarnessStore, signal: new AbortController().signal }
})

let ids = 0
const call = (name: string, args: Record<string, unknown> = {}): ToolCall => ({ id: String(ids++), name, args })
const search = (query: string) => call('test_search_jobs', { query })
const turn = (...toolCalls: ToolCall[]): ModelReply => ({ message: { type: 'ai', data: {} }, text: '', toolCalls })
const finalText = (text: string): ModelReply => ({ message: { type: 'ai', data: {} }, text, toolCalls: [] })

// A broken limit would loop forever on microtasks, past the test timeout; fail fast instead.
const MAX_MODEL_CALLS = 30
function guard() {
  if (model.mock.calls.length > MAX_MODEL_CALLS) throw new Error('runaway loop: tool limit not applied')
}

// Each loop turn makes `perTurn` data calls; the final-reply call (toolChoice 'none') answers 'final'.
function modelMaking(perTurn: number) {
  model.mockImplementation(async ({ toolChoice }: ModelRequest) => {
    guard()
    return toolChoice === 'none' ? finalText('final') : turn(...Array.from({ length: perTurn }, (_, i) => search(`q${ids}-${i}`)))
  })
}

// Loop turns only: select_keys (reset_context's reload) is forced with 'any' too.
const loopTurns = () => model.mock.calls.filter(([{ toolChoice, tools }]) => toolChoice === 'any' && tools?.[0].function.name !== 'select_keys').length
const lastChoice = () => model.mock.calls.at(-1)?.[0].toolChoice

test('ends after 9 tool calls and writes the final reply', async () => {
  modelMaking(1)
  await expect(toolLoop(freshContext('q'), run)).resolves.toBe('final')
  expect(loopTurns()).toBe(9)
  expect(lastChoice()).toBe('none')
})

test('counts every call in a turn', async () => {
  modelMaking(3)
  await expect(toolLoop(freshContext('q'), run)).resolves.toBe('final')
  expect(loopTurns()).toBe(3)
})

test('the turn that reaches the limit runs all its calls', async () => {
  modelMaking(12)
  await expect(toolLoop(freshContext('q'), run)).resolves.toBe('final')
  expect(loopTurns()).toBe(1)
  expect(Object.keys(run.store.getState().harness.toolCalls)).toHaveLength(12)
})

test('below the limit the loop continues', async () => {
  model
    .mockResolvedValueOnce(turn(search('a'), search('b'), search('c'), search('d')))
    .mockResolvedValueOnce(turn(search('e'), search('f'), search('g'), search('h')))
    .mockResolvedValueOnce(turn(call('finish_and_reply', { reply: 'done' })))
  await expect(toolLoop(freshContext('q'), run)).resolves.toBe('done')
  expect(loopTurns()).toBe(3)
})

test('finish_and_reply at the limit keeps its reply', async () => {
  model
    .mockResolvedValueOnce(turn(...'abcdefgh'.split('').map(search)))
    .mockResolvedValueOnce(turn(call('finish_and_reply', { reply: 'done' })))
  await expect(toolLoop(freshContext('q'), run)).resolves.toBe('done')
  expect(model).toHaveBeenCalledTimes(2)
})

test('off_topic_question at the limit keeps its fixed reply', async () => {
  model
    .mockResolvedValueOnce(turn(...'abcdefgh'.split('').map(search)))
    .mockResolvedValueOnce(turn(call('off_topic_question')))
  await expect(toolLoop(freshContext('q'), run)).resolves.toBe("That's not what i'm here for")
  expect(model).toHaveBeenCalledTimes(2)
})

test('the count carries across reset_context', async () => {
  model.mockImplementation(async ({ toolChoice, tools }: ModelRequest) => {
    guard()
    if (toolChoice === 'none') return finalText('final')
    if (tools?.[0].function.name === 'select_keys') return turn(call('select_keys', { keys: [] }))
    return loopTurns() === 1 ? turn(...'abcdefg'.split('').map(search), call('reset_context')) : turn(search(`x${ids}`))
  })
  await expect(toolLoop(freshContext('q'), run)).resolves.toBe('final')
  // 8 calls in the first turn, 1 more after the reset reaches 9.
  expect(loopTurns()).toBe(2)
})
