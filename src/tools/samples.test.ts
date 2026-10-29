import { describe, expect, test } from 'vitest'
import { createRegistry } from '.'
import { keywordSearch, sleep } from './samples/fake'
import { searchExperience } from './samples/searchExperience'
import { searchProjects } from './samples/searchProjects'
import { outbox, sendMessage } from './samples/sendMessage'

const ctx = (key: string) => ({ callId: 'c', idempotencyKey: key, signal: new AbortController().signal })

describe('registry', () => {
  test('lists and finds tools by name', () => {
    const tools = [searchExperience, searchProjects, sendMessage]
    const registry = createRegistry(tools)
    expect(registry.names).toEqual(['search_experience', 'search_projects', 'send_message'])
    expect(registry.get('search_projects')).toBe(searchProjects)
    expect(registry.get('nope')).toBeUndefined()
    expect(createRegistry([searchProjects]).names).toEqual(['search_projects'])
    expect(registry.list).toBe(tools)
  })

  test('offers send_message only when the visitor asks to reach Ryan', () => {
    const offered = (text: string) => createRegistry([searchExperience, searchProjects, sendMessage]).offered({ original: text }).map(t => t.name)
    for (const text of ['Send Ryan a message', 'How can I contact him?', 'Tell Ryan I said hi', 'What is his email?']) {
      expect(offered(text)).toContain('send_message')
    }
    for (const text of ['Tell me about his React work', 'What projects has he built?']) {
      expect(offered(text)).toEqual(['search_experience', 'search_projects'])
    }
  })
})

describe('fake backend helpers', () => {
  test('keywordSearch matches any word, case-insensitive, else returns everything', () => {
    const items = [{ name: 'React app' }, { name: 'Go service' }]
    expect(keywordSearch(items, 'REACT stuff')).toEqual([{ name: 'React app' }])
    expect(keywordSearch(items, 'cobol')).toEqual(items)
  })

  test('sleep waits', async () => {
    const start = Date.now()
    await sleep(20)
    expect(Date.now() - start).toBeGreaterThanOrEqual(15)
  })
})

describe('sample tools', () => {
  test('search_experience', async () => {
    const result = (await searchExperience.run({ query: 'node' }, ctx('k'))) as { results: { company: string }[] }
    expect(result.results.map(r => r.company)).toEqual(['Example Labs'])
  })

  test('search_projects', async () => {
    const result = (await searchProjects.run({ query: 'webgpu' }, ctx('k'))) as { results: { name: string }[] }
    expect(result.results.map(r => r.name)).toEqual(['homepage-2026'])
  })

  test('send_message delivers once per idempotency key and verifies by reading back', async () => {
    const args = { name: 'Sam', message: 'hi' }
    expect(await sendMessage.run(args, ctx('turn:send#1'))).toEqual({ delivered: true })
    await sendMessage.run({ ...args, message: 'retry' }, ctx('turn:send#1'))
    expect(outbox.get('turn:send#1')).toEqual(args)
    expect(await sendMessage.verify!(args, {}, ctx('turn:send#1'))).toBe(true)
    expect(await sendMessage.verify!(args, {}, ctx('turn:never-sent'))).toBe(false)
    expect(sendMessage.sideEffect).toBe(true)
  })
})
