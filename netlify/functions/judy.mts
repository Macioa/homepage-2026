// Judy: LLM-as-a-judge. POST /api/judy { prompt, history, toolResults, answer } -> the verdict.
// One Groq call (gpt-oss-120b) grades the harness's final answer with structured output (1 worst, 100 best),
// validated with zod. Sentry gets exactly one thing: a failing verdict (a bad answer from the app), as a warning with
// the verdict as structured context. A good verdict is only logged.
// Soft fail: Judy never errors at the caller and never reports its own failures. A missing key, bad input, failed or
// rate-limited Groq call, or malformed verdict is logged and answered 200 { judged: false }.

import * as Sentry from '@sentry/node'
import { z } from 'zod'
import { setSpanAttributes, withSentry } from '../sentry.ts'

const MODEL = 'openai/gpt-oss-120b'
const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'
const TIMEOUT_MS = 20_000
const FLUSH_MS = 1_000
const MAX_BYTES = 256 * 1024
// A verdict is alerted when it fails and a score is below this.
export const ALERT_BELOW = 60

const dsn = process.env.SENTRY_DSN
void (dsn && !Sentry.getClient() && Sentry.init({ dsn }))

const SYSTEM = `You are Judy, a strict judge of a chatbot's final answer on a personal portfolio site.
You get the visitor's prompt, the recent conversation history, the tool results the bot fetched, and the bot's final answer.
Score 1 (worst) to 100 (best):
- accuracy: every claim is supported by the tool results or history. Unsupported facts are hallucinations.
- completeness: the answer addresses everything the prompt asked.
- formatting: clear, concise, readable for a chat bubble.
pass is true only when the answer is accurate and useful. primary_issue is "none" when pass is true.
Only flag hallucination when a claim contradicts or goes beyond the tool results and history shown.
reason: one or two sentences.`

const RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'output_validation',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        pass: { type: 'boolean' },
        scores: {
          type: 'object',
          properties: {
            accuracy: { type: 'integer', minimum: 1, maximum: 100 },
            completeness: { type: 'integer', minimum: 1, maximum: 100 },
            formatting: { type: 'integer', minimum: 1, maximum: 100 }
          },
          required: ['accuracy', 'completeness', 'formatting'],
          additionalProperties: false
        },
        primary_issue: { type: 'string', enum: ['none', 'hallucination', 'incomplete', 'off_topic', 'format_error'] },
        reason: { type: 'string' }
      },
      required: ['pass', 'scores', 'primary_issue', 'reason'],
      additionalProperties: false
    }
  }
}

const score = z.number().int().min(1).max(100)
const VerdictSchema = z.strictObject({
  pass: z.boolean(),
  scores: z.strictObject({ accuracy: score, completeness: score, formatting: score }),
  primary_issue: z.enum(['none', 'hallucination', 'incomplete', 'off_topic', 'format_error']),
  reason: z.string()
})

export type Verdict = z.infer<typeof VerdictSchema>

type Case = { prompt: string; history?: unknown; toolResults?: unknown; answer: string }

// Groq's rate limit: the run is skipped, not reported.
class RateLimited extends Error {}

const fail = (message: string): never => {
  throw new Error(message)
}

const rateLimited = (): never => {
  throw new RateLimited()
}

const section = (title: string, body: unknown) => `## ${title}\n${typeof body === 'string' ? body : JSON.stringify(body)}`

export const alerting = (v: Verdict) => !v.pass && Math.min(v.scores.accuracy, v.scores.completeness, v.scores.formatting) < ALERT_BELOW

export async function judge(c: Case, signal?: AbortSignal): Promise<Verdict> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      reasoning_effort: 'low',
      response_format: RESPONSE_FORMAT,
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: [
            section('Prompt', c.prompt),
            section('History', c.history ?? []),
            section('Tool results', c.toolResults ?? {}),
            section('Final answer', c.answer)
          ].join('\n\n')
        }
      ]
    }),
    signal: signal ?? AbortSignal.timeout(TIMEOUT_MS)
  })
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string }; choices?: { message?: { content?: string } }[] }
  const content =
    res.status === 429
      ? rateLimited()
      : !res.ok
        ? fail(`groq ${res.status}: ${json.error?.message ?? 'no body'}`)
        : json.choices?.[0]?.message?.content
  return VerdictSchema.parse(JSON.parse(content ?? ''))
}

const flush = () => Promise.race([Sentry.flush(FLUSH_MS), new Promise(r => setTimeout(r, FLUSH_MS))]).catch(() => {})

function report(c: Case, v: Verdict) {
  console.log('judy', JSON.stringify(v))
  setSpanAttributes({
    'judy.pass': v.pass,
    'judy.primary_issue': v.primary_issue,
    'judy.accuracy': v.scores.accuracy,
    'judy.completeness': v.scores.completeness,
    'judy.formatting': v.scores.formatting,
    'judy.alert': alerting(v)
  })
  void (
    alerting(v) &&
    // The reason makes each message unique, so Sentry's Dedupe never drops a repeat alert; the fingerprint groups by issue.
    Sentry.captureMessage(`judy: ${v.primary_issue}: ${v.reason}`, {
      level: 'warning',
      fingerprint: ['judy', v.primary_issue],
      tags: {
        function: 'judy',
        pass: v.pass,
        primary_issue: v.primary_issue,
        accuracy: v.scores.accuracy,
        completeness: v.scores.completeness,
        formatting: v.scores.formatting
      },
      contexts: { verdict: { ...v.scores, pass: v.pass, primary_issue: v.primary_issue, reason: v.reason } },
      extra: { prompt: c.prompt, answer: c.answer, history: c.history, toolResults: c.toolResults }
    })
  )
}

const valid = (c: Partial<Case>) => typeof c?.prompt === 'string' && typeof c?.answer === 'string'

// The request body as a Case; throws on a missing key, oversized body or missing fields.
const parseCase = (text: string): Case =>
  !process.env.GROQ_API_KEY
    ? fail('GROQ_API_KEY not set')
    : text.length > MAX_BYTES
      ? fail('judy: body too large')
      : asCase(JSON.parse(text) as Partial<Case>)

const asCase = (c: Partial<Case>): Case => (valid(c) ? (c as Case) : fail('judy: expected { prompt, answer }'))

// A rate limit is skipped; any other failure is logged. Neither is reported.
const failed = (err: unknown) =>
  err instanceof RateLimited
    ? (console.log('judy: rate limited, skipped'), Response.json({ judged: false, skipped: 'rate_limited' }))
    : (console.warn('judy failed', err), Response.json({ judged: false }))

const handler = async (req: Request) => {
  try {
    const c = parseCase(await req.text())
    const verdict = await judge(c)
    report(c, verdict)
    return Response.json({ judged: true, verdict })
  } catch (err) {
    return failed(err)
  } finally {
    await flush()
  }
}

// The span (verdict attributes) goes to Grafana via withSentry; Judy always answers 200, so it adds no Sentry report.
export default withSentry('judy', handler)

export const config = { path: '/api/judy', method: 'POST' }
