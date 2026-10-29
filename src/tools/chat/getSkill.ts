// One of Ryan's skills with when and how long he has used it (public.get_skill).

import { z } from 'zod'
import { defineTool } from '../defineTool'
import { mode, rpc, type GetToken } from './rpc'

export const getSkill = (getToken: GetToken) =>
  defineTool({
    name: 'get_skill',
    description: 'look up one Ryan skill and how long he used it',
    args: z.object({ skill: z.string().describe('skill name, e.g. React'), mode: mode.optional() }),
    run: ({ skill, mode }, { signal }) => rpc(getToken, 'get_skill', { p_skill: skill, ...(mode && { p_mode: mode }) }, signal)
  })
