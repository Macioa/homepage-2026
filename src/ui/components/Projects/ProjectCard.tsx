import type { Project } from '../../../connections/projects'
import { ImageGallery } from './ImageGallery'
import { ProjectDates } from './ProjectDates'
import style from './projects.module.css'

// Expandable sections, shown only when the project has data for them. Labels follow the column names.
const PANELS: { key: keyof Project; label: string; tags?: boolean }[] = [
  { key: 'problem_to_solve', label: 'Problem to solve' },
  { key: 'objective', label: 'Objective' },
  { key: 'key_features', label: 'Features' },
  { key: 'result', label: 'Result' },
  { key: 'brag_detail', label: 'Humble brags' },
  { key: 'tools_used', label: 'Tools used', tags: true }
]

const filled = (v: unknown): string[] => (Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()) : [])

const hostOf = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url
  }
}

const LinkChips = ({ label, urls }: { label: string; urls?: string[] }) =>
  filled(urls).map(u => (
    <a key={u} className={style.chip} href={u} target='_blank' rel='noopener noreferrer' title={u}>
      {label}
      <span className={style.chipHost}>{hostOf(u)}</span>
    </a>
  ))

export const ProjectCard = ({ project }: { project: Project }) => {
  const panels = PANELS.map(p => ({ ...p, values: filled(project[p.key]) })).filter(p => p.values.length)
  const images = filled(project.image_urls)
  return (
    <article className={`${style.card} ${images.length ? '' : style.noImages}`}>
      {images.length > 0 && <ImageGallery images={images} title={project.name} />}
      <div className={style.body}>
        <header className={style.cardHeader}>
          <div className={style.heading}>
            <h2 className={style.title}>{project.name}</h2>
            <ProjectDates project={project} />
          </div>
          <div className={style.links}>
            <LinkChips label='Live' urls={project.live_url} />
            <LinkChips label='Source' urls={project.source_url} />
          </div>
        </header>
        {project.desc && <p className={style.overview}>{project.desc}</p>}
        {panels.length > 0 && (
          <div className={style.panels}>
            {panels.map(({ key, label, tags, values }) => (
              <details key={key} className={style.panel}>
                <summary>
                  {label}
                  <span className={style.count}>{values.length}</span>
                </summary>
                <ul className={tags ? style.tags : style.bullets}>
                  {values.map((v, i) => (
                    <li key={i}>{v}</li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        )}
      </div>
    </article>
  )
}
