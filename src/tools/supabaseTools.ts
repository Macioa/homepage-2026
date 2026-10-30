// Supabase tools: Postgres functions the chat role may run, called through PostgREST with the redux chat JWT.

import { z } from 'zod'
import { callRpc, DataAccessError } from '../connections/supabase'
import { TOKEN_NOT_READY, TOOL, TOOL_ARG } from '../prompts'
import type { DataTool, ToolContext } from './tool'

const mode = z.enum(['precise', 'start_to_end']).describe(TOOL_ARG.mode)

const skillArgs = z.object({ skill: z.string().describe(TOOL_ARG.skill), mode: mode.optional() })
const skillsArgs = z.object({ skills: z.array(z.string()).describe(TOOL_ARG.skills), mode: mode.optional() })
const pitchArgs = z.object({ slugs: z.array(z.string()).describe(TOOL_ARG.slugs), mode })

async function rpc(fn: string, args: Record<string, unknown>, { token, signal }: ToolContext) {
  if (!token) throw new DataAccessError(TOKEN_NOT_READY)
  return callRpc(fn, args, token, signal)
}

// Names of every Ryan skill (public.get_all_skills).
export const getAllSkills: DataTool = {
  kind: 'data',
  name: 'get_all_skills',
  description: TOOL.getAllSkills,
  args: z.object({}),
  examplePrompt: "What are Ryan's top skills?",
  run: (_args, ctx) => rpc('get_all_skills', {}, ctx)
}

// One skill with when and how long Ryan used it (public.get_skill).
export const getSkill: DataTool<typeof skillArgs> = {
  kind: 'data',
  name: 'get_skill',
  description: TOOL.getSkill,
  args: skillArgs,
  examplePrompt: 'How long has Ryan worked with distributed systems?',
  run: ({ skill, mode }, ctx) => rpc('get_skill', { p_skill: skill, ...(mode && { p_mode: mode }) }, ctx)
}

// Several skills at once (public.get_skills).
export const getSkills: DataTool<typeof skillsArgs> = {
  kind: 'data',
  name: 'get_skills',
  description: TOOL.getSkills,
  args: skillsArgs,
  run: ({ skills, mode }, ctx) => rpc('get_skills', { p_skills: skills, ...(mode && { p_mode: mode }) }, ctx)
}

// Material, skills and evidence for named pitches (public.pitch_detail). Nothing the model can call
// lists slugs, so it only helps when the slug is already known.
export const pitchDetail: DataTool<typeof pitchArgs> = {
  kind: 'data',
  name: 'pitch_detail',
  description: TOOL.pitchDetail,
  args: pitchArgs,
  run: ({ slugs, mode }, ctx) => rpc('pitch_detail', { p_slugs: slugs, p_mode: mode }, ctx)
}
