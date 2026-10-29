// A tool: named, zod-typed args and an async run(). The chat tools call Supabase; the samples are fakes.

import type { z } from 'zod'
import type { Prompt } from './types'

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
  // Offered only for prompts that call for it (default: always).
  offerIf?(prompt: Prompt): boolean
  timeoutMs?: number
  run(args: z.infer<A>, ctx: ToolContext): Promise<unknown>
  // Re-checks a successful result.
  verify?(args: z.infer<A>, result: unknown, ctx: ToolContext): Promise<boolean>
}

export const defineTool = <A extends z.ZodObject>(tool: Tool<A>) => tool
