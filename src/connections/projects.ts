// Projects from public.projects (personal repo) via get_projects(), read as the chat role.
import { callRpc } from './supabase'
import type { OnNetworkError } from './networkError'

// get_projects() drops empty arrays and nulls, so every field but name may be missing.
export type Project = {
  name: string
  desc?: string
  // Partial dates, same pattern as the resume tables: any part may be missing; no end_year means ongoing.
  start_day?: number
  start_month?: number
  start_year?: number
  end_day?: number
  end_month?: number
  end_year?: number
  problem_to_solve?: string[]
  objective?: string[]
  result?: string[]
  brag_detail?: string[]
  key_features?: string[]
  tools_used?: string[]
  image_urls?: string[]
  live_url?: string[]
  source_url?: string[]
}

export const fetchProjects = (token: string, onError: OnNetworkError, signal?: AbortSignal): Promise<Project[]> =>
  callRpc('get_projects', {}, token, onError, signal)
