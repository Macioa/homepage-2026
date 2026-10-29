// Names of every Ryan skill (public.get_all_skills).

import { z } from 'zod'
import { defineTool } from '../defineTool'
import { rpc, type GetToken } from './rpc'

export const getAllSkills = (getToken: GetToken) =>
  defineTool({
    name: 'get_all_skills',
    description: 'list the names of all Ryan skills',
    args: z.object({}),
    run: (_args, { signal }) => rpc(getToken, 'get_all_skills', {}, signal)
  })
