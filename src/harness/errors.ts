// What the visitor sees when a turn ends without a normal answer: the problem, stated plainly with
// the numbers that explain it. No advice, no apologies.

import type { Limits } from './config'
import type { Call, Rejection } from './state/types'

const seconds = (ms: number) => `${Math.round(ms / 1000)} s`

const REJECTION = {
  unknown: (r: Rejection) => `it cites ${r.id}, which is not a tool call from this request`,
  failed: (r: Rejection) => `it relies on ${r.id}, which failed (${r.error})`,
  unconfirmed: (r: Rejection) => `it relies on ${r.id}, which reported success but could not be confirmed`
}

export const problems = {
  stopped: (step: number) => `Stopped by user at step ${step}.`,

  timedOut: (limits: Limits, step: number) =>
    `Timed out: no answer within the ${seconds(limits.turnTimeoutMs)} limit per request (stopped at step ${step}).`,

  stepLimit: (limits: Limits) => `No answer after ${limits.maxSteps} steps, the limit per request.`,

  stuck: (failed: Call, attempts: number) =>
    `Stopped: ${failed.tool} was requested ${attempts} times with the same arguments and failed (${failed.error}).`,

  invalidReplies: (count: number, error: string) =>
    `Stopped: ${count} model replies did not match the reply format (last: ${error}).`,

  failed: (message: string) => `Error: ${message}`,

  unverified: (answer: string, rejection: Rejection) =>
    `${answer}\n\n[Unverified: ${REJECTION[rejection.problem](rejection)}.]`,

  interrupted: (replayed: Call[]) =>
    [
      'Interrupted: the page reloaded during this request.',
      ...replayed.map(call =>
        call.status === 'ok'
          ? `${call.tool} (${call.id}) was re-sent and succeeded.`
          : `${call.tool} (${call.id}) was re-sent and failed (${call.error}).`
      )
    ].join(' ')
}
