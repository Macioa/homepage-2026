// One voice prompt to text through the transcribe Netlify function (netlify/functions/transcribe.mts).

import { logNetworkError, since, type OnNetworkError } from './networkError'

const ENDPOINT = '/api/transcribe'

export async function transcribeAudio(audio: Blob, token: string, signal: AbortSignal, onError: OnNetworkError): Promise<string> {
  const start = Date.now()
  const details = { bytes: audio.size, type: audio.type }
  const headers = { 'Content-Type': audio.type || 'audio/webm', Authorization: `Bearer ${token}` }
  const res = await fetch(ENDPOINT, { method: 'POST', headers, body: audio, signal }).catch((error: Error) => {
    if (signal.aborted) throw error
    throw logNetworkError(error, { source: 'netlify', kind: 'network', target: ENDPOINT, elapsedMs: since(start), details }, onError)
  })
  const body = await res.json().catch(() => ({}))
  if (res.ok) return body.text ?? ''
  const error = new Error(body.error ?? `transcribe ${res.status}`)
  const kind = body.timeout || res.status === 504 ? 'timeout' : 'http'
  throw logNetworkError(error, { source: body.source ?? 'netlify', kind, target: ENDPOINT, status: res.status, elapsedMs: since(start), details }, onError)
}
