// Functional tools steer the harness loop; data tools run and return a result. Both reach the model as a ToolSpec.

import { z } from 'zod'
import type { ToolSpec } from '../connections/gemini'
import type { OnNetworkError } from '../connections/networkError'

// examplePrompt: a visitor question the tool answers, listed in the chat greeting.
export type FunctionalTool = { kind: 'functional'; name: string; description: string; args: z.ZodObject; examplePrompt?: string }

// What a data tool gets besides its args: the Supabase chat JWT from redux (null until fetched), the run's abort signal,
// and the onError that records a failed request (state/networkErrors.ts).
export type ToolContext = { token: string | null; signal: AbortSignal; onError: OnNetworkError }

export type DataTool<A extends z.ZodObject = z.ZodObject> = {
  kind: 'data'
  name: string
  description: string
  args: A
  examplePrompt?: string
  run(args: z.infer<A>, ctx: ToolContext): Promise<unknown>
}

export type Tool = FunctionalTool | DataTool

// A tool as the model sees it: name, description and JSON-schema args.
export const toToolSpec = ({ name, description, args }: { name: string; description: string; args: z.ZodObject }): ToolSpec => ({
  type: 'function',
  function: { name, description, parameters: z.toJSONSchema(args) }
})
