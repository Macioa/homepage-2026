import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import { LIMITS } from '../config'
import { makeStore } from '../testing'
import { turnStarted } from '../state/slice'
import { defineTool } from './defineTool'
import { runTool, signature } from './runner'

function harnessFor(tool: ReturnType<typeof defineTool>) {
  const { store, trace } = makeStore()
  store.dispatch(
    turnStarted({ turnId: 't1', prompt: { original: '', caveman: '' }, messages: [], toolNames: [tool.name], at: 0 })
  )
  const ctx = {
    act: store.dispatch,
    getSession: () => store.getState().harness.session,
    limits: { ...LIMITS, toolTimeoutMs: 30 }
  }
  return { ctx, trace }
}

const counting = (impl: (n: number) => Promise<unknown>) => {
  const stats = { runs: 0 }
  const tool = defineTool({
    name: 'echo',
    description: 'echo',
    args: z.object({ text: z.string() }),
    run: () => impl(++stats.runs)
  })
  return { tool, stats }
}

test('signature ignores key order', () => {
  expect(signature('t', { a: 1, b: [{ y: 2, x: 1 }] })).toBe(signature('t', { b: [{ x: 1, y: 2 }], a: 1 }))
  expect(signature('t', { a: 1 })).not.toBe(signature('t', { a: 2 }))
})

describe('runTool', () => {
  test('success: started then succeeded, with an idempotency key per call', async () => {
    const { tool } = counting(async () => 'hi')
    const { ctx, trace } = harnessFor(tool)
    const call = await runTool(ctx, tool, { text: 'x' })
    expect(call).toMatchObject({ id: 'echo#1', status: 'ok', result: 'hi', attempts: 1, idempotencyKey: 't1:echo#1' })
    expect(trace.actions()).toEqual(['turnStarted', 'toolCallStarted', 'toolCallSucceeded'])
  })

  test('error: recorded, not thrown', async () => {
    const { tool } = counting(async () => {
      throw new Error('boom')
    })
    const { ctx } = harnessFor(tool)
    expect(await runTool(ctx, tool, { text: 'x' })).toMatchObject({ status: 'failed', kind: 'error', error: 'boom' })
  })

  test('timeout: one retry, then failed', async () => {
    const { tool, stats } = counting(() => new Promise(() => {}))
    const { ctx, trace } = harnessFor(tool)
    const call = await runTool(ctx, tool, { text: 'x' })
    expect(call).toMatchObject({ status: 'failed', kind: 'timeout', error: 'timed out after 30 ms', attempts: 2 })
    expect(stats.runs).toBe(2)
    expect(trace.actions()).toContain('toolCallRetried')
  })

  test('identical successful call is answered from the first one', async () => {
    const { tool, stats } = counting(async n => `run ${n}`)
    const { ctx, trace } = harnessFor(tool)
    await runTool(ctx, tool, { text: 'x' })
    const again = await runTool(ctx, tool, { text: 'x' })
    expect(again).toMatchObject({ id: 'echo#2', status: 'ok', attempts: 0, result: 'run 1' })
    expect(stats.runs).toBe(1)
    expect(trace.actions().at(-1)).toBe('toolCallDeduped')
    const other = await runTool(ctx, tool, { text: 'y' })
    expect(other.result).toBe('run 2')
  })

  test('identical failed call is refused', async () => {
    const { tool, stats } = counting(async () => {
      throw new Error('nope')
    })
    const { ctx } = harnessFor(tool)
    await runTool(ctx, tool, { text: 'x' })
    const again = await runTool(ctx, tool, { text: 'x' })
    expect(again).toMatchObject({
      status: 'failed',
      kind: 'repeat',
      attempts: 0,
      error: 'same call failed before as echo#1 (nope). no repeat'
    })
    expect(stats.runs).toBe(1)
  })

  test('a tool timeout overrides the default', async () => {
    const tool = defineTool({
      name: 'slow',
      description: 'slow',
      args: z.object({}),
      timeoutMs: 80,
      run: () => new Promise(resolve => setTimeout(() => resolve('late but ok'), 50))
    })
    const { ctx } = harnessFor(tool)
    expect(await runTool(ctx, tool, {})).toMatchObject({ status: 'ok', result: 'late but ok' })
  })
})
