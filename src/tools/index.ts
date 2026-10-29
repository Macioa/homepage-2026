// Tool registry: look up tools by name, or the ones a prompt is offered.

import type { Prompt } from './types'
import type { Tool } from './defineTool'

export { defineTool, type Tool, type ToolContext } from './defineTool'

export type Registry = ReturnType<typeof createRegistry>

export function createRegistry(list: Tool[]) {
  const byName = new Map(list.map(tool => [tool.name, tool]))
  return {
    list,
    names: list.map(tool => tool.name),
    get: (name: string) => byName.get(name),
    // The tools this prompt may use (see Tool.offerIf).
    offered: (prompt: Prompt) => list.filter(tool => !tool.offerIf || tool.offerIf(prompt))
  }
}
