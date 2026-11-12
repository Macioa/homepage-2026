// POST /api/transcribe <audio bytes> (Content-Type: the recording's mime type) -> { text }, with the chat JWT as a
// Bearer token. One Gemini call that turns a short voice prompt into text; the browser puts it in the prompt field.
// Logged in the same Gemini rate window as /api/chat (../supabase.ts). Errors are tagged { error, source, timeout }
// like the chat function's.

import { logGeminiRequest, SUPABASE_ENV, TokenRefusedError } from '../supabase.ts'

const MODEL = 'gemini-3.1-flash-lite'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`
const INSTRUCTION = 'Transcribe this speech verbatim. Reply with only the transcript, no commentary. Empty reply if there is no speech.'
const ENV = ['GEMINI_API_KEY', ...SUPABASE_ENV]
const GEMINI_TIMEOUT_MS = 20_000
const USAGE_LIMIT = 10
// Opus at ~8 kbps: a minute is ~60 KB. Anything bigger is not a short voice prompt.
const MAX_BYTES = 512 * 1024
const PASSED_THROUGH = [429, 503]

type ErrorSource = 'gemini' | 'netlify'

type GeminiResponse = { error?: { message?: string }; candidates?: { content?: { parts?: { text?: string }[] } }[] }

const errorResponse = (error: string, source: ErrorSource, status: number, timeout = false) => Response.json({ error, source, timeout }, { status })

const timedOut = (signal: AbortSignal) => signal.reason?.name === 'TimeoutError'

async function refusal(req: Request, signal: AbortSignal) {
  const authorization = req.headers.get('authorization')
  if (!authorization) return errorResponse('no chat token', 'netlify', 401)
  const calls = await logGeminiRequest(authorization, signal).catch((err: Error) => err)
  if (calls instanceof Error) {
    const status = calls instanceof TokenRefusedError ? 401 : timedOut(signal) ? 504 : 500
    return errorResponse(calls.message, 'netlify', status, timedOut(signal))
  }
  if (calls > USAGE_LIMIT) return errorResponse('usage limit reached', 'netlify', 429)
}

// The mime type without codec parameters, which Gemini rejects.
const baseMime = (type: string | null) => (type ?? '').split(';')[0].trim()

async function transcribe(audio: ArrayBuffer, mimeType: string, signal: AbortSignal) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: INSTRUCTION }, { inline_data: { mime_type: mimeType, data: Buffer.from(audio).toString('base64') } }] }],
    generationConfig: { temperature: 0 }
  }
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY ?? '' },
    body: JSON.stringify(body),
    signal
  })
  const json = (await res.json().catch(() => ({}))) as GeminiResponse
  if (!res.ok) throw Object.assign(new Error(json.error?.message ?? `gemini ${res.status}`), { status: res.status })
  const parts: { text?: string }[] = json.candidates?.[0]?.content?.parts ?? []
  return parts.map(part => part.text ?? '').join('').trim()
}

export default async (req: Request) => {
  const missing = ENV.filter(name => !process.env[name])
  if (missing.length) return errorResponse(`${missing.join(', ')} not set`, 'netlify', 500)
  const mimeType = baseMime(req.headers.get('content-type'))
  if (!mimeType.startsWith('audio/')) return errorResponse('expected audio', 'netlify', 415)
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(GEMINI_TIMEOUT_MS)])
  const audio = await req.arrayBuffer()
  if (!audio.byteLength) return errorResponse('empty recording', 'netlify', 400)
  if (audio.byteLength > MAX_BYTES) return errorResponse('recording too long', 'netlify', 413)
  const refused = await refusal(req, signal)
  if (refused) return refused
  try {
    return Response.json({ text: await transcribe(audio, mimeType, signal) })
  } catch (err) {
    const { status } = err as { status?: number }
    const code = timedOut(signal) ? 504 : status && PASSED_THROUGH.includes(status) ? status : 500
    return errorResponse((err as Error).message, 'gemini', code, timedOut(signal))
  }
}

export const config = { path: '/api/transcribe', method: 'POST' }
