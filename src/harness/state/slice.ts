// Harness memory in Redux.
// history: what the visitor asked and the final answers they got. Kept across prompts.
// session: working state of the current turn (model context, tool calls). Reset by turnStarted.
// Every harness operation is one of these actions, so DevTools (or trace.ts) shows the whole run.

import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { Call, FailKind, HarnessState, Msg, Prompt, Rejection, Session, TurnStatus } from './types'

const idleSession = (): Session => ({
  turnId: null,
  prompt: { original: '', caveman: '' },
  status: 'idle',
  step: 0,
  startedAt: 0,
  messages: [],
  tools: {},
  rejections: 0,
  finalRejections: 0
})

const initialState: HarnessState = { history: [], session: idleSession() }

const callIn = (state: HarnessState, tool: string, id: string): Call =>
  state.session.tools[tool].find(call => call.id === id)!

const addCall = (state: HarnessState, call: Call) => {
  ;(state.session.tools[call.tool] ??= []).push(call)
}

const harness = createSlice({
  name: 'harness',
  initialState,
  reducers: {
    turnStarted(
      state,
      { payload }: PayloadAction<{ turnId: string; prompt: Prompt; messages: Msg[]; toolNames: string[]; at: number }>
    ) {
      state.session = {
        ...idleSession(),
        turnId: payload.turnId,
        prompt: payload.prompt,
        status: 'running',
        startedAt: payload.at,
        messages: payload.messages,
        tools: Object.fromEntries(payload.toolNames.map(name => [name, []]))
      }
      state.history.push({ id: payload.turnId, prompt: payload.prompt, status: 'running' })
    },
    // A past answer rewritten caveman for this and later turns' context.
    answerCompressed(state, { payload }: PayloadAction<{ turnId: string; caveman: string }>) {
      const turn = state.history.find(t => t.id === payload.turnId)
      if (turn) turn.answerCaveman = payload.caveman
    },
    // The turn's first step is done: the prompt rewritten caveman, and the context the loop starts from.
    promptCompressed(state, { payload }: PayloadAction<{ caveman: string; messages: Msg[] }>) {
      state.session.prompt.caveman = payload.caveman
      state.session.messages = payload.messages
      const turn = state.history.find(t => t.id === state.session.turnId)
      if (turn) turn.prompt.caveman = payload.caveman
    },
    stepStarted(state, { payload }: PayloadAction<number>) {
      state.session.step = payload
    },
    // Trace only: the grammar the reply must follow and how big the context was.
    modelRequested(_state, _action: PayloadAction<{ step: number; tokens: number; schema: string }>) {},
    modelResponded(state, { payload }: PayloadAction<{ raw: string; ms: number }>) {
      state.session.messages.push({ role: 'assistant', content: payload.raw })
    },
    decisionRejected(state, _action: PayloadAction<{ raw: string; error: string }>) {
      state.session.rejections++
    },
    toolCallStarted(state, { payload }: PayloadAction<Call>) {
      addCall(state, payload)
    },
    // Answered from an identical earlier call without running the tool again.
    toolCallDeduped(state, { payload }: PayloadAction<Call>) {
      addCall(state, payload)
    },
    toolCallRetried(state, { payload }: PayloadAction<{ tool: string; id: string; reason: string }>) {
      callIn(state, payload.tool, payload.id).attempts++
    },
    toolCallSucceeded(state, { payload }: PayloadAction<{ tool: string; id: string; result: unknown; ms: number }>) {
      Object.assign(callIn(state, payload.tool, payload.id), { status: 'ok', result: payload.result, ms: payload.ms })
    },
    toolCallFailed(
      state,
      { payload }: PayloadAction<{ tool: string; id: string; kind: FailKind; error: string; ms?: number }>
    ) {
      const { kind, error, ms } = payload
      Object.assign(callIn(state, payload.tool, payload.id), { status: 'failed', kind, error, ms })
    },
    observationAdded(state, { payload }: PayloadAction<Msg>) {
      state.session.messages.push(payload)
    },
    contextCompacted(state, { payload }: PayloadAction<{ messages: Msg[]; before: number; after: number }>) {
      state.session.messages = payload.messages
    },
    finalRejected(state, _action: PayloadAction<{ answer: string; rejection: Rejection }>) {
      state.session.finalRejections++
    },
    turnFinished(state, { payload }: PayloadAction<{ status: TurnStatus; answer: string }>) {
      state.session.status = payload.status
      const turn = state.history.find(t => t.id === state.session.turnId)
      if (turn) Object.assign(turn, payload)
    }
  }
})

export const {
  turnStarted,
  answerCompressed,
  promptCompressed,
  stepStarted,
  modelRequested,
  modelResponded,
  decisionRejected,
  toolCallStarted,
  toolCallDeduped,
  toolCallRetried,
  toolCallSucceeded,
  toolCallFailed,
  observationAdded,
  contextCompacted,
  finalRejected,
  turnFinished
} = harness.actions

export const harnessReducer = harness.reducer
