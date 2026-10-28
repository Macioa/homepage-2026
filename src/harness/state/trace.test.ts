import { describe, expect, test } from 'vitest'
import { final, search, setup, toolCall } from '../testing'
import { toMarkdown } from './trace'

describe('trace', () => {
  test('records each harness action with a compact view of the state after it', async () => {
    const { harness, trace } = setup([toolCall('search', { query: 'react' }), final('Ryan uses React.', ['search#1'])], [search])
    await harness.run('Please tell me about React')

    const [started, compressed, , requested] = trace.entries
    expect(started).toMatchObject({ n: 1, type: 'turnStarted', payload: { messages: '0 messages (see session)' } })
    expect(started.session.prompt).toEqual({ original: 'Please tell me about React', caveman: '' })
    expect(compressed).toMatchObject({ type: 'promptCompressed', payload: { caveman: 'about React' } })
    expect(compressed.session.prompt).toEqual({ original: 'Please tell me about React', caveman: 'about React' })
    expect(compressed.session.messages[1]).toBe('user (~3 tok): about React')
    // The decision grammar is summarized instead of dumped.
    expect(requested.payload).toMatchObject({ schema: 'tool search' })
    expect(trace.entries.find(e => e.type === 'modelRequested' && e.n > 4)?.payload).toMatchObject({
      schema: 'tool search | final (used ∈ search#1)'
    })
    expect(trace.entries.at(-1)!.history).toEqual([
      { status: 'done', prompt: 'Please tell me about React', answer: 'Ryan uses React.' }
    ])
  })

  test('clips long strings and ignores non-harness actions', async () => {
    const { store, trace } = setup([], [])
    store.dispatch({ type: 'ui/other' })
    expect(trace.entries).toEqual([])
    const long = 'x'.repeat(1000)
    store.dispatch({ type: 'harness/decisionRejected', payload: { raw: long, error: 'e' } })
    expect((trace.entries[0].payload as { raw: string }).raw).toBe('x'.repeat(400) + '…(+600 chars)')
    trace.clear()
    expect(trace.entries).toEqual([])
  })

  test('renders Markdown: header, timeline, one section per action, history', async () => {
    const { harness, trace } = setup([toolCall('search', { query: 'react' }), final('Ryan uses React.', ['search#1'])], [search])
    await harness.run('Please tell me about React')

    const md = trace.markdown('Happy path')
    expect(md).toContain('# Happy path')
    expect(md).toContain('- **Caveman (what the model saw):** about React')
    expect(md).toContain('- **Final status:** `done` after 2 step(s), 12 actions')
    expect(md).toContain('| 7 | toolCallSucceeded | 1 | running | 3 | search#1 ok |')
    expect(md).toContain('### 12. turnFinished')
    // After the first action, each step shows only what changed.
    expect(md).toContain('### 4. modelRequested\n\n**Payload**')
    expect(md).toMatch(/### 4\. modelRequested[\s\S]*?_No session change\._/)
    expect(md).toMatch(/### 7\. toolCallSucceeded[\s\S]*?"calls": \[\s*\{\s*"id": "search#1",\s*"status": "ok"/)
    expect(md).toContain('## Session at the end')
    expect(md).toContain('## History after the run')
    expect(toMarkdown([], 'Empty')).toBe('# Empty\n\nNo actions recorded.\n')
  })
})
