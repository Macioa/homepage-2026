// Read-only views of the session.

import type { Call, Session } from './types'

export const allCalls = (session: Session) => Object.values(session.tools).flat()

export const findCall = (session: Session, id: string) => allCalls(session).find(call => call.id === id)

// Calls with the same tool and args as `call`, including itself.
export const sameCalls = (session: Session, call: Call) =>
  session.tools[call.tool].filter(other => other.signature === call.signature)

// The most recent call the model saw a result for (calls are grouped by tool, so order comes from messages).
export const lastCall = (session: Session) => {
  const id = session.messages.findLast(message => message.kind === 'observation')?.callId
  return id ? findCall(session, id) : undefined
}

// The call in flight, if any (the loop runs one at a time).
export const activeCall = (session: Session) => allCalls(session).find(call => call.status === 'started')
