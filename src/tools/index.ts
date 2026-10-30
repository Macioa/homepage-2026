// Tool register

import { finishAndReply, noAppropriateTool, offTopicQuestion, resetContext } from './functionalTools'
import { getAllSkills, getSkill, getSkills, pitchDetail } from './supabaseTools'
import { testGetProjects, testGetSkills, testSearchJobs } from './testTools'
import { toToolSpec, type Tool } from './tool'

export const TOOLS: Tool[] = [
  // functional
  finishAndReply,
  resetContext,
  noAppropriateTool,
  offTopicQuestion,
  // supabase
  getAllSkills,
  getSkill,
  getSkills,
  pitchDetail
  // TEST (not live): testGetSkills, testGetProjects, testSearchJobs in testTools.ts
]

// Tool index

export const TOOL_INDEX: Record<string, Tool | undefined> = Object.fromEntries(TOOLS.map(tool => [tool.name, tool]))

export const TOOL_SPECS = TOOLS.map(toToolSpec)

export { finishAndReply, getAllSkills, getSkill, getSkills, noAppropriateTool, offTopicQuestion, pitchDetail, resetContext, toToolSpec }
export { testGetProjects, testGetSkills, testSearchJobs }
export type { DataTool, FunctionalTool, Tool, ToolContext } from './tool'
