// The Supabase functions the chat role may run, as tools. getToken reads the Redux chat JWT.

import { getAllSkills } from './getAllSkills'
import { getSkill } from './getSkill'
import { getSkills } from './getSkills'
import { pitchDetail } from './pitchDetail'
import type { GetToken } from './rpc'

export const createChatTools = (getToken: GetToken) => [getAllSkills(getToken), getSkill(getToken), getSkills(getToken), pitchDetail(getToken)] as const
