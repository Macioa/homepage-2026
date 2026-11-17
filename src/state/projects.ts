// Projects page: all rows fetched once on first open, rendered as a window [start, end) that grows in batches
// as the list scrolls. A ?project= link opens the window on that card alone, then it grows outward both ways.
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { fetchProjects, type Project } from '../connections/projects'
import { onNetworkError } from './networkErrors'
import { linkedProject, projectSlug } from './projectLink'

export const PROJECT_BATCH = 4

export type ProjectsState = {
  items: Project[]
  start: number
  end: number
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  // Slug from a ?project= link: its card is rendered and centered once projects load.
  focus: string | null
}

const initialState: ProjectsState = { items: [], start: 0, end: PROJECT_BATCH, status: 'idle', error: null, focus: linkedProject() }

type ProjectsRoot = { projects: ProjectsState }

export const loadProjects = createAsyncThunk<Project[], void, { state: ProjectsRoot }>(
  'projects/load',
  async (_, { dispatch, signal }) => fetchProjects(onNetworkError(dispatch), signal),
  { condition: (_, { getState }) => ['idle', 'error'].includes(getState().projects.status) }
)

const projects = createSlice({
  name: 'projects',
  initialState,
  reducers: {
    showMoreProjects: state => {
      state.end = Math.min(state.end + PROJECT_BATCH, state.items.length)
    },
    showEarlierProjects: state => {
      state.start = Math.max(state.start - PROJECT_BATCH, 0)
    },
    projectFocused: state => {
      state.focus = null
    }
  },
  extraReducers: builder => {
    builder
      .addCase(loadProjects.pending, state => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(loadProjects.fulfilled, (state, { payload }) => {
        state.status = 'ready'
        state.items = payload ?? []
        const target = state.focus ? state.items.findIndex(p => projectSlug(p.name) === state.focus) : -1
        state.start = Math.max(target, 0)
        state.end = target >= 0 ? target + 1 : Math.min(PROJECT_BATCH, state.items.length)
      })
      .addCase(loadProjects.rejected, (state, { error }) => {
        state.status = 'error'
        state.error = error.message ?? 'Could not load projects'
      })
  }
})

export const { showMoreProjects, showEarlierProjects, projectFocused } = projects.actions
export const projectsReducer = projects.reducer
