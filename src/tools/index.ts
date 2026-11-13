// Tool register

import { finishAndReply, noAppropriateTool, offTopicQuestion, resetContext } from './functionalTools'
import { getAllFaqs, getAllPitches, getAllSkills, getFaq, getFaqs, getPitches, getSkill, getSkills, graphqlQuery, pitchDetail, searchSkills, sendMessage } from './supabaseTools'
import { testGetProjects, testGetSkills, testSearchJobs } from './testTools'
import { toToolSpec, type Tool } from './tool'

export const TOOLS: Tool[] = [
  // functional
  finishAndReply,
  noAppropriateTool,
  offTopicQuestion,
  // supabase
  getAllSkills,
  searchSkills,
  pitchDetail,
  sendMessage,
  graphqlQuery
  // NOT LIVE (search_skills covers them): getSkill, getSkills in supabaseTools.ts
  // NOT LIVE: resetContext in functionalTools.ts (the harness still handles it, see harness/loop.ts)
  // NOT LIVE (graphql_query covers them): getAllPitches, getPitches, getAllFaqs, getFaq, getFaqs in supabaseTools.ts
  // TEST (not live): testGetSkills, testGetProjects, testSearchJobs in testTools.ts
]

// Tool index

export const TOOL_INDEX: Record<string, Tool | undefined> = Object.fromEntries(TOOLS.map(tool => [tool.name, tool]))

export const TOOL_SPECS = TOOLS.map(toToolSpec)

export { finishAndReply, getAllFaqs, getAllPitches, getAllSkills, getFaq, getFaqs, getPitches, getSkill, getSkills, graphqlQuery, noAppropriateTool, offTopicQuestion, pitchDetail, resetContext, searchSkills, sendMessage, toToolSpec }
export { testGetProjects, testGetSkills, testSearchJobs }
export type { DataTool, FunctionalTool, Tool, ToolContext } from './tool'
