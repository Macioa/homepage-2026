// Dev tool: records every harness action with a compact view of the state after it, and renders the
// run as Markdown. The app's store records into window.harnessTrace in dev (see src/store).
// In the console: harnessTrace.clear(), run a prompt, then copy(harnessTrace.markdown('Title')).

import type { Middleware, UnknownAction } from '@reduxjs/toolkit'
import { estimateTokens } from '../../llm/prefillTiming.js'
import { allCalls } from './selectors'
import type { HarnessState, Session } from './types'

const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max)}…(+${text.length - max} chars)`)
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

// "tool search_experience | final (used ∈ search_experience#1)" from a decision JSON schema.
function describeSchema(schema: string) {
  const options: { properties: Record<string, { const?: string; items?: { enum?: string[] } }> }[] =
    JSON.parse(schema).anyOf
  return options
    .map(({ properties: p }) => {
      if (p.tool) return `tool ${p.tool.const}`
      const used = p.used?.items?.enum
      return used ? `final (used ∈ ${used.join(', ')})` : 'final (nothing to cite)'
    })
    .join(' | ')
}

function shrink(key: string, value: unknown): unknown {
  if (key === 'schema' && typeof value === 'string') return describeSchema(value)
  if (key === 'messages' && Array.isArray(value)) return value.length + ' messages (see session)'
  if (typeof value === 'string') return clip(value, 400)
  if (Array.isArray(value)) return value.map(item => shrink('', item))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shrink(k, v)]))
  }
  return value
}

function sessionView(session: Session) {
  return {
    status: session.status,
    step: session.step,
    prompt: session.prompt,
    rejections: session.rejections,
    finalRejections: session.finalRejections,
    messages: session.messages.map(m => {
      const label = [m.kind ?? m.role, m.callId].filter(Boolean).join(' ')
      return `${label} (~${estimateTokens(m.content)} tok): ${clip(oneLine(m.content), 140)}`
    }),
    calls: allCalls(session).map(({ id, status, attempts, kind, error, ms }) =>
      JSON.parse(JSON.stringify({ id, status, attempts, kind, error, ms }))
    )
  }
}

export type TraceEntry = {
  n: number
  type: string
  payload: unknown
  session: ReturnType<typeof sessionView>
  history: { status: string; prompt: string; answer?: string }[]
}

const json = (value: unknown) => '```json\n' + JSON.stringify(value, null, 2) + '\n```'

type View = TraceEntry['session']
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// What an action changed: the fields that differ, new or rewritten messages (by index), new or updated calls.
function changes(prev: View | undefined, next: View) {
  if (!prev) return next
  const out: Record<string, unknown> = {}
  for (const key of ['status', 'step', 'prompt', 'rejections', 'finalRejections'] as const) {
    if (!same(prev[key], next[key])) out[key] = next[key]
  }
  const messages = next.messages.flatMap((m, i) => (prev.messages[i] === m ? [] : [`[${i}] ${m}`]))
  if (messages.length) out.messages = messages
  if (next.messages.length < prev.messages.length) out.messagesDropped = prev.messages.length - next.messages.length
  const calls = next.calls.filter(call => !same(call, prev.calls.find(p => p.id === call.id)))
  if (calls.length) out.calls = calls
  return out
}

export function toMarkdown(entries: TraceEntry[], title = 'Harness run') {
  const last = entries.at(-1)
  if (!last) return `# ${title}\n\nNo actions recorded.\n`
  const { prompt } = last.session
  const lines = [
    `# ${title}`,
    '',
    `- **Prompt:** ${prompt.original}`,
    `- **Caveman (what the model saw):** ${prompt.caveman}`,
    `- **Final status:** \`${last.session.status}\` after ${last.session.step} step(s), ${entries.length} actions`,
    '',
    '## Timeline',
    '',
    '| # | action | step | status | messages | calls |',
    '|---|---|---|---|---|---|',
    ...entries.map(e => {
      const calls = e.session.calls.map(c => `${c.id} ${c.status}`).join(', ') || '-'
      return `| ${e.n} | ${e.type} | ${e.session.step} | ${e.session.status} | ${e.session.messages.length} | ${calls} |`
    }),
    '',
    '## Steps',
    '',
    'Each action with its payload and what it changed in the session (the first shows the whole session).',
    ''
  ]
  entries.forEach((e, i) => {
    const changed = changes(entries[i - 1]?.session, e.session)
    lines.push(`### ${e.n}. ${e.type}`, '', '**Payload**', '', json(e.payload), '')
    lines.push(Object.keys(changed).length ? `**Session changes**\n\n${json(changed)}` : '_No session change._', '')
  })
  lines.push('## Session at the end', '', json(last.session), '', '## History after the run', '', json(last.history), '')
  return lines.join('\n')
}

export function createTrace() {
  const entries: TraceEntry[] = []
  const middleware: Middleware<{}, { harness: HarnessState }> = api => next => action => {
    const result = next(action)
    const { type, payload } = action as UnknownAction
    if (type.startsWith('harness/')) {
      const { session, history } = api.getState().harness
      entries.push({
        n: entries.length + 1,
        type: type.slice('harness/'.length),
        payload: shrink('', payload),
        session: sessionView(session),
        history: history.map(t => ({ status: t.status, prompt: t.prompt.original, answer: t.answer }))
      })
    }
    return result
  }
  return {
    middleware,
    entries,
    actions: () => entries.map(e => e.type),
    clear: () => void entries.splice(0),
    markdown: (title?: string) => toMarkdown(entries, title)
  }
}

export type Trace = ReturnType<typeof createTrace>
