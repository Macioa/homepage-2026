// Soft-fail checks: node --env-file=.env.local scripts/judy-softfail.mts. Every failure answers 200 { judged: false }, sends nothing to Sentry.
import * as Sentry from '@sentry/node'
const root = '../'
const m = await import(root + 'netlify/functions/judy.mts')
const { sendToJudy } = await import(root + 'src/judy.ts')

let sentryEvents = 0
Sentry.getClient()?.on('beforeSendEvent', () => sentryEvents++)

const realFetch = globalThis.fetch
const groq = (fake: () => Promise<Response>) =>
  (globalThis.fetch = ((url: string, init: RequestInit) => (String(url).includes('groq') ? fake() : realFetch(url, init))) as typeof fetch)
const groqContent = (content: string) => () => Promise.resolve(Response.json({ choices: [{ message: { content } }] }))
const good = JSON.stringify({ prompt: 'q', answer: 'a', toolResults: {} })

const cases: [string, () => void, string][] = [
  ['missing key', () => (process.env.GROQ_API_KEY = ''), good],
  ['bad JSON body', () => {}, 'not json'],
  ['missing fields', () => {}, '{}'],
  ['oversized body', () => {}, JSON.stringify({ prompt: 'x'.repeat(300_000), answer: 'a' })],
  ['rate limit 429', () => groq(() => Promise.resolve(Response.json({ error: { message: 'rate' } }, { status: 429 }))), good],
  ['groq 500', () => groq(() => Promise.resolve(Response.json({ error: { message: 'boom' } }, { status: 500 }))), good],
  ['groq 401 bad key', () => groq(() => Promise.resolve(Response.json({ error: { message: 'invalid key' } }, { status: 401 }))), good],
  ['network error', () => groq(() => Promise.reject(new TypeError('fetch failed'))), good],
  ['timeout', () => groq(() => Promise.reject(new DOMException('timed out', 'TimeoutError'))), good],
  ['non-JSON reply', () => groq(() => Promise.resolve(new Response('<html>502</html>', { status: 200 }))), good],
  ['malformed content', () => groq(groqContent('not json')), good],
  ['schema-invalid verdict', () => groq(groqContent(JSON.stringify({ pass: 'yes', scores: { accuracy: 500 } }))), good],
  [
    'extra field',
    () =>
      groq(
        groqContent(
          JSON.stringify({ pass: true, scores: { accuracy: 90, completeness: 90, formatting: 90 }, primary_issue: 'none', reason: 'r', x: 1 })
        )
      ),
    good
  ]
]

const key = process.env.GROQ_API_KEY
let ok = true
for (const [label, setup, body] of cases) {
  process.env.GROQ_API_KEY = key
  globalThis.fetch = realFetch
  setup()
  const before = sentryEvents
  const res = await m
    .default(new Request('http://x/api/judy', { method: 'POST', body }))
    .catch((e: Error) => ({ status: 'THREW ' + e.message }) as never)
  const json = await (res as Response).json?.().catch(() => null)
  const pass = (res as Response).status === 200 && json?.judged === false && sentryEvents === before
  ok &&= pass
  console.log('RESULT', pass ? 'PASS' : 'FAIL', label.padEnd(24), (res as Response).status, JSON.stringify(json), 'sentry+' + (sentryEvents - before))
}
globalThis.fetch = realFetch

// Client trigger: never throws, never waits, even when fetch throws or rejects.
const clientCase = (label: string, f: typeof fetch) => {
  globalThis.fetch = f
  const t = Date.now()
  let threw = false
  try {
    sendToJudy({ prompt: 'q', history: [], toolResults: {}, answer: 'a' })
  } catch {
    threw = true
  }
  const pass = !threw && Date.now() - t < 50
  ok &&= pass
  console.log('RESULT', pass ? 'PASS' : 'FAIL', ('client: ' + label).padEnd(24), threw ? 'threw' : 'returned', Date.now() - t + 'ms')
}
clientCase('fetch rejects', (() => Promise.reject(new Error('offline'))) as typeof fetch)
clientCase('fetch throws sync', (() => {
  throw new Error('no fetch')
}) as typeof fetch)
clientCase('fetch hangs', (() => new Promise(() => {})) as typeof fetch)
globalThis.fetch = realFetch
await new Promise(r => setTimeout(r, 100))
console.log('RESULT', ok ? 'ALL PASS' : 'SOME FAILED')
process.exit(0)
