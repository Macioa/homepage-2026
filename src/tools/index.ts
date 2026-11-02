// Tool register

import { finishAndReply, noAppropriateTool, offTopicQuestion, resetContext } from './functionalTools'
import { getAllFaqs, getAllSkills, getFaq, getFaqs, getSkill, getSkills, pitchDetail, sendMessage } from './supabaseTools'
import { testGetProjects, testGetSkills, testSearchJobs } from './testTools'
import { toToolSpec, type Tool } from './tool'

export const TOOLS: Tool[] = [
  // functional
  finishAndReply,
  noAppropriateTool,
  offTopicQuestion,
  // supabase
  getAllSkills,
  getSkill,
  getSkills,
  pitchDetail,
  getAllFaqs,
  getFaq,
  getFaqs,
  sendMessage
  // NOT LIVE: resetContext in functionalTools.ts (the harness still handles it, see harness/loop.ts)
  // TEST (not live): testGetSkills, testGetProjects, testSearchJobs in testTools.ts
]

// Tool index

export const TOOL_INDEX: Record<string, Tool | undefined> = Object.fromEntries(TOOLS.map(tool => [tool.name, tool]))

export const TOOL_SPECS = TOOLS.map(toToolSpec)

export { finishAndReply, getAllFaqs, getAllSkills, getFaq, getFaqs, getSkill, getSkills, noAppropriateTool, offTopicQuestion, pitchDetail, resetContext, sendMessage, toToolSpec }
export { testGetProjects, testGetSkills, testSearchJobs }
export type { DataTool, FunctionalTool, Tool, ToolContext } from './tool'
