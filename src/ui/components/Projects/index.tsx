import { useEffect, useRef } from 'react'
import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { loadProjects, projectFocused, showMoreProjects } from '../../../state/projects'
import { ProjectCard } from './ProjectCard'
import style from './projects.module.css'

const PRELOAD_MARGIN = '400px 0px'

// Projects page: fetched on first open, cards mounted in batches as the sentinel nears the viewport.
export const Projects = () => {
  const dispatch = useAppDispatch()
  const open = useAppSelector(s => s.ui.view === 'projects')
  const { items, visibleCount, status, error, focus } = useAppSelector(s => s.projects)
  const sentinel = useRef<HTMLDivElement>(null)
  const hasMore = visibleCount < items.length

  useEffect(() => {
    if (open) dispatch(loadProjects())
  }, [open, dispatch])

  useEffect(() => {
    const el = sentinel.current
    if (!open || !el || !hasMore) return
    const io = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) dispatch(showMoreProjects())
      },
      { rootMargin: PRELOAD_MARGIN }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [open, hasMore, visibleCount, dispatch])

  // Project link: center the linked card once it is mounted, then forget the link.
  useEffect(() => {
    if (!open || !focus || status !== 'ready') return
    document.getElementById(`project-${focus}`)?.scrollIntoView({ block: 'center' })
    dispatch(projectFocused())
  }, [open, focus, status, dispatch])

  if (!open) return null

  return (
    <section id='projects' className={style.projects} aria-label='Projects' aria-busy={status === 'loading'}>
      <div className={style.list}>
        {items.slice(0, visibleCount).map(p => (
          <ProjectCard key={p.name} project={p} />
        ))}
        {status === 'loading' && [0, 1].map(i => <div key={i} className={style.skeletonCard} aria-hidden />)}
        {status === 'error' && (
          <div className={style.notice} role='alert'>
            <p>Could not load projects. {error}</p>
            <button type='button' className={style.button} onClick={() => dispatch(loadProjects())}>
              Retry
            </button>
          </div>
        )}
        {status === 'ready' && items.length === 0 && <p className={style.notice}>No projects yet.</p>}
        {hasMore && <div ref={sentinel} className={style.sentinel} aria-hidden />}
      </div>
    </section>
  )
}
