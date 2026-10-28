import { expect, test } from 'vitest'
import { LIMITS } from './config'
import { problems } from './errors'
import type { Call } from './state/types'

const call = (over: Partial<Call>): Call => ({
  id: 'send_message#1',
  tool: 'send_message',
  args: {},
  signature: '',
  idempotencyKey: '',
  status: 'ok',
  attempts: 1,
  ...over
})

test('each problem says what happened, with the numbers behind it', () => {
  expect(problems.stopped(2)).toBe('Stopped by user at step 2.')
  expect(problems.timedOut(LIMITS, 3)).toBe('Timed out: no answer within the 180 s limit per request (stopped at step 3).')
  expect(problems.stepLimit(LIMITS)).toBe('No answer after 6 steps, the limit per request.')
  expect(problems.stuck(call({ tool: 'lookup', error: 'not found' }), 3)).toBe(
    'Stopped: lookup was requested 3 times with the same arguments and failed (not found).'
  )
  expect(problems.invalidReplies(3, 'not valid JSON')).toBe(
    'Stopped: 3 model replies did not match the reply format (last: not valid JSON).'
  )
  expect(problems.failed('GPU lost')).toBe('Error: GPU lost')
})

test('unverified answers keep the answer and say which call could not be trusted', () => {
  expect(problems.unverified('Sent!', { id: 'x#2', problem: 'unknown' })).toBe(
    'Sent!\n\n[Unverified: it cites x#2, which is not a tool call from this request.]'
  )
  expect(problems.unverified('Sent!', { id: 'x#1', problem: 'failed', error: 'boom' })).toBe(
    'Sent!\n\n[Unverified: it relies on x#1, which failed (boom).]'
  )
  expect(problems.unverified('Sent!', { id: 'x#1', problem: 'unconfirmed' })).toBe(
    'Sent!\n\n[Unverified: it relies on x#1, which reported success but could not be confirmed.]'
  )
})

test('interrupted lists what was re-sent', () => {
  expect(problems.interrupted([])).toBe('Interrupted: the page reloaded during this request.')
  expect(problems.interrupted([call({}), call({ id: 'send_message#2', status: 'failed', error: 'timed out after 5000 ms' })])).toBe(
    'Interrupted: the page reloaded during this request. send_message (send_message#1) was re-sent and succeeded. ' +
      'send_message (send_message#2) was re-sent and failed (timed out after 5000 ms).'
  )
})
