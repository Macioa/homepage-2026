// Search Ryan's projects. Hard-coded sample data until this reads from Supabase.

import { z } from 'zod'
import { defineTool } from '../defineTool'
import { keywordSearch, sleep } from './fake'

const PROJECTS = [
  {
    name: 'homepage-2026',
    summary: 'This site: React, Redux and an in-browser LLM running on WebGPU.'
  },
  {
    name: 'Sample Dashboard',
    summary: 'Realtime metrics dashboard built with TypeScript and WebSockets.'
  }
]

export const searchProjects = defineTool({
  name: 'search_projects',
  description: 'search Ryan projects by keyword',
  args: z.object({ query: z.string().describe('keywords, e.g. webgpu') }),
  async run({ query }) {
    await sleep(250)
    return { results: keywordSearch(PROJECTS, query) }
  }
})
