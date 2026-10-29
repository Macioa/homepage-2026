// TEST TOOLS: hardcoded responses, not real data.

import { z } from 'zod'
import { TOOL, TOOL_ARG } from '../prompts'
import type { DataTool } from './tool'

const TEST_SKILLS = { skills: ['TypeScript', 'React', 'Redux', 'Node.js', 'Postgres'] }

const TEST_PROJECTS = {
  projects: [
    { name: 'TEST homepage-2026', stack: ['React', 'Redux', 'Gemini'] },
    { name: 'TEST dashboard', stack: ['TypeScript', 'WebSockets'] }
  ]
}

const TEST_JOBS = {
  jobs: [
    { role: 'TEST Senior Engineer', company: 'TEST Co.', years: '2022-2026' },
    { role: 'TEST Engineer', company: 'TEST Labs', years: '2018-2022' }
  ]
}

const searchArgs = z.object({ query: z.string().describe(TOOL_ARG.query) })

export const testGetSkills: DataTool = {
  kind: 'data',
  name: 'test_get_skills',
  description: TOOL.testGetSkills,
  args: z.object({}),
  run: async () => TEST_SKILLS
}

export const testGetProjects: DataTool = {
  kind: 'data',
  name: 'test_get_projects',
  description: TOOL.testGetProjects,
  args: z.object({}),
  run: async () => TEST_PROJECTS
}

// The query is ignored.
export const testSearchJobs: DataTool<typeof searchArgs> = {
  kind: 'data',
  name: 'test_search_jobs',
  description: TOOL.testSearchJobs,
  args: searchArgs,
  run: async () => TEST_JOBS
}
