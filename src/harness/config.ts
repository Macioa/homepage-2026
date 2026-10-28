// Harness limits. createHarness({ limits }) can override any of them (the tests use short timeouts).

export const LIMITS = {
  maxSteps: 6,
  // Prompt reading runs ~26 tok/s on the test machine (see src/llm/config.js), so each step is slow.
  turnTimeoutMs: 180_000,
  toolTimeoutMs: 5_000,
  // Retries after a timeout, always with the same idempotency key.
  toolRetries: 1,
  maxObservationChars: 1_500,
  // Compaction starts above this. Small on purpose: every token in context has to be read again.
  contextBudgetTokens: 3_000,
  keepRecentObservations: 2,
  historyTurns: 3,
  // An identical failed call attempted more than this ends the turn as stuck.
  maxRepeats: 2,
  maxInvalidDecisions: 2,
  maxReplyTokens: 512,
  // The caveman rewrite of a prompt or past answer (see model/caveman.ts) is shorter than the text.
  cavemanMaxTokens: 256
}

export type Limits = typeof LIMITS
