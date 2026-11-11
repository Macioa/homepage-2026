// Supabase tools: Postgres functions the chat role may run, called through PostgREST with the redux chat JWT.

import { z } from 'zod'
import { callRpc, DataAccessError } from '../connections/supabase'
import { TOKEN_NOT_READY, TOOL, TOOL_ARG } from '../prompts'
import type { DataTool, ToolContext } from './tool'

const mode = z.enum(['precise', 'start_to_end']).describe(TOOL_ARG.mode)

const skillArgs = z.object({ skill: z.string().describe(TOOL_ARG.skill), mode: mode.optional() })
const skillsArgs = z.object({ skills: z.array(z.string()).describe(TOOL_ARG.skills), mode: mode.optional() })
const pitchesArgs = z.object({ slugs: z.array(z.string()).describe(TOOL_ARG.slugs) })
const pitchArgs = pitchesArgs.extend({ mode })
const faqArgs = z.object({ slug: z.string().describe(TOOL_ARG.faqSlug) })
const faqsArgs = z.object({ slugs: z.array(z.string()).describe(TOOL_ARG.faqSlugs) })
const messageArgs = z.object({
  message: z.string().min(1).max(5000).describe(TOOL_ARG.message),
  from: z.string().max(320).optional().describe(TOOL_ARG.from)
})

const graphqlArgs = z.object({
  query: z.string().min(1).describe(TOOL_ARG.graphqlQuery)
})
// Anywhere in the text, so a leading # comment or a second operation can't hide it. The chat role has no
// mutation fields anyway; this keeps the refusal clear for the model.
const MUTATION = /\bmutation\b/i
const READ_ONLY = 'Read only: mutations are not allowed.'

async function rpc(fn: string, args: Record<string, unknown>, { token, signal, onError }: ToolContext) {
  if (!token) throw new DataAccessError(TOKEN_NOT_READY)
  return callRpc(fn, args, token, onError, signal)
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

// Slug, type, title and when to use every pitch, no material (public.get_all_pitches).
export const getAllPitches: DataTool = {
  kind: 'data',
  name: 'get_all_pitches',
  description: TOOL.getAllPitches,
  args: z.object({}),
  run: (_args, ctx) => rpc('get_all_pitches', {}, ctx)
}

// Material and keywords for named pitches, without skills or evidence (public.get_pitches).
export const getPitches: DataTool<typeof pitchesArgs> = {
  kind: 'data',
  name: 'get_pitches',
  description: TOOL.getPitches,
  args: pitchesArgs,
  run: ({ slugs }, ctx) => rpc('get_pitches', { p_slugs: slugs }, ctx)
}

// Material, skills and evidence for named pitches (public.pitch_detail).
export const pitchDetail: DataTool<typeof pitchArgs> = {
  kind: 'data',
  name: 'pitch_detail',
  description: TOOL.pitchDetail,
  args: pitchArgs,
  run: ({ slugs, mode }, ctx) => rpc('pitch_detail', { p_slugs: slugs, p_mode: mode }, ctx)
}

// Slug and question of every FAQ, no answers (public.get_all_faqs).
export const getAllFaqs: DataTool = {
  kind: 'data',
  name: 'get_all_faqs',
  description: TOOL.getAllFaqs,
  args: z.object({}),
  run: (_args, ctx) => rpc('get_all_faqs', {}, ctx)
}

// One FAQ's question and answer; null for an unknown slug (public.get_faq).
export const getFaq: DataTool<typeof faqArgs> = {
  kind: 'data',
  name: 'get_faq',
  description: TOOL.getFaq,
  args: faqArgs,
  run: ({ slug }, ctx) => rpc('get_faq', { p_slug: slug }, ctx)
}

// Several FAQs at once; unknown slugs are dropped (public.get_faqs).
export const getFaqs: DataTool<typeof faqsArgs> = {
  kind: 'data',
  name: 'get_faqs',
  description: TOOL.getFaqs,
  args: faqsArgs,
  run: ({ slugs }, ctx) => rpc('get_faqs', { p_slugs: slugs }, ctx)
}

// Leaves Ryan a message (public.send_message). Write-only: returns no row, so success is reported here.
export const sendMessage: DataTool<typeof messageArgs> = {
  kind: 'data',
  name: 'send_message',
  description: TOOL.sendMessage,
  args: messageArgs,
  examplePrompt: 'Leave Ryan a message.',
  run: async ({ message, from }, ctx) => {
    await rpc('send_message', { message, ...(from && { from }) }, ctx)
    return { sent: true }
  }
}

type GraphqlResult = { data?: unknown; errors?: { message: string }[] }

// Any read query over the career tables through public.graphql_read, which runs pg_graphql in a read-only
// transaction: the database refuses every write. The schema is in the description. GraphQL errors (bad field)
// throw so the model can fix its query.
export const graphqlQuery: DataTool<typeof graphqlArgs> = {
  kind: 'data',
  name: 'graphql_query',
  description: TOOL.graphqlQuery,
  args: graphqlArgs,
  run: async ({ query }, ctx) => {
    if (MUTATION.test(query)) throw new Error(READ_ONLY)
    const { data, errors } = (await rpc('graphql_read', { query }, ctx)) as GraphqlResult
    if (errors?.length) throw new Error(errors.map(e => e.message).join('; '))
    return data
  }
}
