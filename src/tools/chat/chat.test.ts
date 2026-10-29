import { afterEach, describe, expect, test, vi } from 'vitest'

// connections/supabase reads these at import.
vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co')
vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'pk')
const { createChatTools } = await import('.')

const ctx = { callId: 'c', idempotencyKey: 'k', signal: new AbortController().signal }

function mockFetch(status = 200, body: unknown = []) {
  const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

const [getAllSkills, getSkill, getSkills, pitchDetail] = createChatTools(() => 'jwt')

afterEach(() => vi.unstubAllGlobals())

describe('chat tools', () => {
  test('call the matching rpc with the chat token and mapped args', async () => {
    const fetch = mockFetch(200, [{ name: 'React' }])
    expect(await getSkill.run({ skill: 'React' }, ctx)).toEqual([{ name: 'React' }])
    await getAllSkills.run({}, ctx)
    await getSkills.run({ skills: ['React', 'Go'], mode: 'precise' }, ctx)
    await pitchDetail.run({ slugs: ['a'], mode: 'start_to_end' }, ctx)

    const calls = fetch.mock.calls as unknown as [string, RequestInit][]
    expect(calls.map(([url]) => url.split('/rest/v1/rpc/')[1])).toEqual(['get_skill', 'get_all_skills', 'get_skills', 'pitch_detail'])
    expect(calls.map(([, init]) => JSON.parse(init.body as string))).toEqual([
      { p_skill: 'React' },
      {},
      { p_skills: ['React', 'Go'], p_mode: 'precise' },
      { p_slugs: ['a'], p_mode: 'start_to_end' }
    ])
    for (const [, init] of calls) expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt')
  })

  test('fails without a token, and on a PostgREST error', async () => {
    const fetch = mockFetch(403, { message: 'permission denied' })
    const [, noToken] = createChatTools(() => null)
    await expect(noToken.run({ skill: 'React' }, ctx)).rejects.toThrow('chat token not ready')
    expect(fetch).not.toHaveBeenCalled()
    await expect(getSkill.run({ skill: 'React' }, ctx)).rejects.toThrow('permission denied')
  })
})
