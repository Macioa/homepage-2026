// Search Ryan's work history. Hard-coded sample data until this reads from Supabase.

import { z } from 'zod'
import { defineTool } from '../defineTool'
import { keywordSearch, sleep } from './fake'

const EXPERIENCE = [
  {
    role: 'Senior Software Engineer',
    company: 'Sample Co.',
    years: '2022-2026',
    summary: 'Led a React + TypeScript web platform and mentored four engineers.'
  },
  {
    role: 'Software Engineer',
    company: 'Example Labs',
    years: '2018-2022',
    summary: 'Built Node.js APIs and data pipelines on Postgres.'
  },
  {
    role: 'Web Developer',
    company: 'Placeholder Studio',
    years: '2015-2018',
    summary: 'Shipped client websites and an internal CMS.'
  }
]

export const searchExperience = defineTool({
  name: 'search_experience',
  description: 'search Ryan jobs by keyword',
  args: z.object({ query: z.string().describe('keywords, e.g. react') }),
  async run({ query }) {
    await sleep(300)
    return { results: keywordSearch(EXPERIENCE, query) }
  }
})
