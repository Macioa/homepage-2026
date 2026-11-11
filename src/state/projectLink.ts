// Deep links to one project: ?project=<slug>, the slug derived from the project name.
export const PROJECT_PARAM = 'project'

export const projectSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

// The slug in the page URL at load, or null when the page was not opened from a project link.
export const linkedProject = (): string | null => {
  try {
    return new URLSearchParams(window.location.search).get(PROJECT_PARAM)
  } catch {
    return null
  }
}
