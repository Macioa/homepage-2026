// A tool the model can call. Today each run() is a fake async function; later it calls Supabase.

import type { z } from 'zod'
import type { Prompt } from '../state/types'

export type ToolContext = {
  callId: string
  // Same key on every retry and post-crash replay of one call, so the backend can dedupe side effects.
  idempotencyKey: string
  signal: AbortSignal
}

export type Tool<A extends z.ZodObject = z.ZodObject> = {
  name: string
  description: string
  args: A
  sideEffect?: boolean
  // Offered to the model only for prompts that call for it (default: always). Checked in code, since a
  // small model ignores "only when asked" in the prompt.
  offerIf?(prompt: Prompt): boolean
  timeoutMs?: number
  run(args: z.infer<A>, ctx: ToolContext): Promise<unknown>
  // Re-checks a successful result before a final answer may cite it.
  verify?(args: z.infer<A>, result: unknown, ctx: ToolContext): Promise<boolean>
}

export const defineTool = <A extends z.ZodObject>(tool: Tool<A>) => tool
