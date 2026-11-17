// Judy trigger: sends a finished run to /api/judy to be graded. Fire and forget; never throws or waits.

export type JudyCase = { prompt: string; history: unknown; toolResults: unknown; answer: string }

export function sendToJudy(c: JudyCase) {
  try {
    void fetch('/api/judy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c), keepalive: true }).catch(
      () => {}
    )
  } catch {
    // soft fail
  }
}
