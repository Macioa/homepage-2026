// Several of Ryan's skills at once (public.get_skills).

import { z } from 'zod'
import { defineTool } from '../defineTool'
import { mode, rpc, type GetToken } from './rpc'

export const getSkills = (getToken: GetToken) =>
  defineTool({
    name: 'get_skills',
    description: 'look up several Ryan skills and how long he used each',
    args: z.object({ skills: z.array(z.string()).describe('skill names, e.g. ["React","Go"]'), mode: mode.optional() }),
    run: ({ skills, mode }, { signal }) => rpc(getToken, 'get_skills', { p_skills: skills, ...(mode && { p_mode: mode }) }, signal)
  })
