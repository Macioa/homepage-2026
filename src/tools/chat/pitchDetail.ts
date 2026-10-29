// Material, skills and evidence for named pitches (public.pitch_detail). Nothing the model can call
// lists slugs, so it only helps when the slug is already known.

import { z } from 'zod'
import { defineTool } from '../defineTool'
import { mode, rpc, type GetToken } from './rpc'

export const pitchDetail = (getToken: GetToken) =>
  defineTool({
    name: 'pitch_detail',
    description: 'read Ryan pitches by exact slug',
    args: z.object({ slugs: z.array(z.string()).describe('pitch slugs'), mode }),
    run: ({ slugs, mode }, { signal }) => rpc(getToken, 'pitch_detail', { p_slugs: slugs, p_mode: mode }, signal)
  })
