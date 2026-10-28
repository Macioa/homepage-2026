// Shapes of harness memory. See slice.ts for how each one changes.

// The visitor's words, and the model's caveman rewrite every later model call uses instead
// (empty until the turn's first step has made it).
export type Prompt = { original: string; caveman: string }

export type Msg = {
  role: 'system' | 'user' | 'assistant'
  content: string
  // Harness bookkeeping, stripped before the model sees the message.
  kind?: 'history' | 'observation' | 'note'
  callId?: string
}

export type FailKind = 'error' | 'timeout' | 'repeat' | 'interrupted'

export type Call = {
  id: string
  tool: string
  args: Record<string, unknown>
  signature: string
  idempotencyKey: string
  status: 'started' | 'ok' | 'failed'
  attempts: number
  result?: unknown
  error?: string
  kind?: FailKind
  ms?: number
}

export type TurnStatus =
  | 'running'
  | 'done'
  | 'unverified'
  | 'stuck'
  | 'max_steps'
  | 'timeout'
  | 'stopped'
  | 'error'
  | 'interrupted'

// answerCaveman: the answer rewritten caveman for later turns' context, made once, when first needed.
export type Turn = { id: string; prompt: Prompt; answer?: string; answerCaveman?: string; status: TurnStatus }

// Why a final answer failed verification: the cited call doesn't exist, failed, or failed its re-check.
export type Rejection = { id: string; problem: 'unknown' | 'failed' | 'unconfirmed'; error?: string }

export type Session = {
  turnId: string | null
  prompt: Prompt
  status: TurnStatus | 'idle'
  step: number
  startedAt: number
  messages: Msg[]
  // One key per registered tool, holding that tool's calls this turn.
  tools: Record<string, Call[]>
  // Replies that failed to parse or validate.
  rejections: number
  // Final answers that failed verification.
  finalRejections: number
}

export type HarnessState = { history: Turn[]; session: Session }
