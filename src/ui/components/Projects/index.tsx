import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { loadProjects, projectFocused, showEarlierProjects, showMoreProjects } from '../../../state/projects'
import { toggleProjects } from '../../../state'
import { ProjectCard } from './ProjectCard'
import style from './projects.module.css'

const PRELOAD_MARGIN = '400px 0px'

// Calls grow() whenever the sentinel nears the scroller's viewport. Re-observes after each growth (key changes),
// so a sentinel that is still in range after a batch mounts triggers the next batch.
const useGrowOnApproach = (sentinel: RefObject<HTMLElement | null>, root: RefObject<HTMLElement | null>, active: boolean, key: number, grow: () => void) => {
  useEffect(() => {
    const el = sentinel.current
    if (!active || !el) return
    const io = new IntersectionObserver(entries => entries.some(e => e.isIntersecting) && grow(), {
      root: root.current,
      rootMargin: PRELOAD_MARGIN
    })
    io.observe(el)
    return () => io.disconnect()
  }, [sentinel, root, active, key, grow])
}

// Projects page: fetched on first open, cards mounted as a window that grows as sentinels near the viewport.
// A project link mounts that card alone first, then the window grows outward in both directions.
export const Projects = () => {
  const dispatch = useAppDispatch()
  const open = useAppSelector(s => s.ui.view === 'projects')
  const { items, start, end, status, error, focus } = useAppSelector(s => s.projects)
  const scroller = useRef<HTMLElement>(null)
  const top = useRef<HTMLDivElement>(null)
  const bottom = useRef<HTMLDivElement>(null)
  // First mounted card and its viewport position before cards are prepended above it.
  const anchor = useRef<{ el: Element; y: number } | null>(null)
  const ready = open && status === 'ready'

  useEffect(() => {
    if (open) dispatch(loadProjects())
  }, [open, dispatch])

  const showMore = useRef(() => dispatch(showMoreProjects())).current
  const showEarlier = useRef(() => {
    const el = scroller.current?.querySelector('[id^="project-"]')
    anchor.current = el ? { el, y: el.getBoundingClientRect().top } : null
    dispatch(showEarlierProjects())
  }).current
  useGrowOnApproach(bottom, scroller, ready && end < items.length, end, showMore)
  useGrowOnApproach(top, scroller, ready && start > 0 && !focus, start, showEarlier)

  // Prepending cards pushes content down: shift the scroll by the same amount so the view stays put.
  useLayoutEffect(() => {
    const a = anchor.current
    if (!a || !scroller.current) return
    scroller.current.scrollTop += a.el.getBoundingClientRect().top - a.y
    anchor.current = null
  }, [start])

  // Project link: center the linked card before first paint, then forget the link (which enables growing upward).
  useLayoutEffect(() => {
    if (!ready || !focus) return
    document.getElementById(`project-${focus}`)?.scrollIntoView({ block: 'center' })
    dispatch(projectFocused())
  }, [ready, focus, dispatch])

  if (!open) return null

  return (
    <section ref={scroller} id='projects' className={style.projects} aria-label='Projects' aria-busy={status === 'loading'}>
      <div className={style.closeBar}>
        <button type='button' className={style.close} aria-label='Close projects' onClick={() => dispatch(toggleProjects())}>
          ×
        </button>
      </div>
      <div className={style.list}>
        {start > 0 && <div ref={top} className={style.sentinel} aria-hidden />}
        {items.slice(start, end).map(p => (
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
        {end < items.length && <div ref={bottom} className={style.sentinel} aria-hidden />}
      </div>
    </section>
  )
}
