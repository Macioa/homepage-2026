// Tool registry: every tool the model may call. Add a tool to `tools` to expose it.

import type { Prompt } from '../state/types'
import type { Tool } from './defineTool'
import { searchExperience } from './samples/searchExperience'
import { searchProjects } from './samples/searchProjects'
import { sendMessage } from './samples/sendMessage'

export { defineTool, type Tool, type ToolContext } from './defineTool'

export const tools: Tool[] = [searchExperience, searchProjects, sendMessage]

export type Registry = ReturnType<typeof createRegistry>

export function createRegistry(list: Tool[] = tools) {
  const byName = new Map(list.map(tool => [tool.name, tool]))
  return {
    list,
    names: list.map(tool => tool.name),
    get: (name: string) => byName.get(name),
    // The tools this prompt may use (see Tool.offerIf).
    offered: (prompt: Prompt) => list.filter(tool => !tool.offerIf || tool.offerIf(prompt))
  }
}
