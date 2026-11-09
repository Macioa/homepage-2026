// Projects page: all rows fetched once on first open, rendered in batches as the list scrolls.
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { fetchProjects, type Project } from '../connections/projects'
import { TOKEN_NOT_READY } from '../prompts'
import { freshToken, type AuthState } from './auth'
import { onNetworkError } from './networkErrors'

export const PROJECT_BATCH = 4

export type ProjectsState = {
  items: Project[]
  visibleCount: number
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
}

const initialState: ProjectsState = { items: [], visibleCount: PROJECT_BATCH, status: 'idle', error: null }

type ProjectsRoot = { auth: AuthState; projects: ProjectsState }

export const loadProjects = createAsyncThunk<Project[], void, { state: ProjectsRoot }>(
  'projects/load',
  async (_, { getState, dispatch, signal }) => {
    const token = await freshToken(getState, dispatch as never)
    if (!token) throw new Error(TOKEN_NOT_READY)
    return fetchProjects(token, onNetworkError(dispatch), signal)
  },
  { condition: (_, { getState }) => ['idle', 'error'].includes(getState().projects.status) }
)

const projects = createSlice({
  name: 'projects',
  initialState,
  reducers: {
    showMoreProjects: state => {
      state.visibleCount = Math.min(state.visibleCount + PROJECT_BATCH, state.items.length)
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
        state.visibleCount = Math.min(PROJECT_BATCH, state.items.length)
      })
      .addCase(loadProjects.rejected, (state, { error }) => {
        state.status = 'error'
        state.error = error.message ?? 'Could not load projects'
      })
  }
})

export const { showMoreProjects } = projects.actions
export const projectsReducer = projects.reducer
