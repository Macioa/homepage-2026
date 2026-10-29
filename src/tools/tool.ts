// Functional tools steer the harness loop; data tools run and return a result. Both reach the model as a ToolSpec.

import { z } from 'zod'
import type { ToolSpec } from '../connections/gemini'

export type FunctionalTool = { kind: 'functional'; name: string; description: string; args: z.ZodObject }

export type DataTool<A extends z.ZodObject = z.ZodObject> = {
  kind: 'data'
  name: string
  description: string
  args: A
  run(args: z.infer<A>): Promise<unknown>
}

export type Tool = FunctionalTool | DataTool

// A tool as the model sees it: name, description and JSON-schema args.
export const toToolSpec = ({ name, description, args }: { name: string; description: string; args: z.ZodObject }): ToolSpec => ({
  type: 'function',
  function: { name, description, parameters: z.toJSONSchema(args) }
})
