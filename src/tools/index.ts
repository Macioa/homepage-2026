// Tool register

import { finishAndReply, noAppropriateTool, resetContext } from './functionalTools'
import { testGetProjects, testGetSkills, testSearchJobs } from './testTools'
import { toToolSpec, type Tool } from './tool'

export const TOOLS: Tool[] = [
  // functional
  finishAndReply,
  resetContext,
  noAppropriateTool,
  // TEST
  testGetSkills,
  testGetProjects,
  testSearchJobs
]

// Tool index

export const TOOL_INDEX: Record<string, Tool | undefined> = Object.fromEntries(TOOLS.map(tool => [tool.name, tool]))

export const TOOL_SPECS = TOOLS.map(toToolSpec)

export { finishAndReply, noAppropriateTool, resetContext, testGetProjects, testGetSkills, testSearchJobs, toToolSpec }
export type { DataTool, FunctionalTool, Tool } from './tool'
