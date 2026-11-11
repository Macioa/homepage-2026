import type { ReactNode } from 'react'
import type { Project } from '../../../connections/projects'
import { projectSlug } from '../../../state/projectLink'
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

// Always-shown yes/no flags below the panels; a missing value reads as false.
const FLAGS: { key: keyof Project; label: string }[] = [
  { key: 'vibe_and_test', label: 'Vibe and test' },
  { key: 'curated_generated_code', label: 'Curated generated code' },
  { key: 'hand_written_code', label: 'Hand written code' }
]

const Flags = ({ project }: { project: Project }) => (
  <ul className={style.flags}>
    {FLAGS.map(({ key, label }) => {
      const on = project[key] === true
      return (
        <li key={key} className={on ? style.flagOn : style.flagOff}>
          <span aria-hidden='true'>{on ? '✓' : '✗'}</span> {label}
        </li>
      )
    })}
  </ul>
)

const filled =(v: unknown): string[] => (Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()) : [])

const hostOf = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url
  }
}

// Renders [text](https://url) markdown links inside plain text; everything else stays text.
const LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g
const RichText = ({ text }: { text: string }) => {
  const parts: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(LINK)) {
    parts.push(text.slice(last, m.index))
    parts.push(
      <a key={m.index} className={style.inlineLink} href={m[2]} target='_blank' rel='noopener noreferrer'>
        {m[1]}
      </a>
    )
    last = m.index + m[0].length
  }
  parts.push(text.slice(last))
  return <>{parts}</>
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
    <article id={`project-${projectSlug(project.name)}`} className={`${style.card} ${images.length ? '' : style.noImages}`}>
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
        {project.desc && <p className={style.overview}>
            <RichText text={project.desc} />
          </p>}
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
                    <li key={i}>
                      <RichText text={v} />
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        )}
        <Flags project={project} />
      </div>
    </article>
  )
}
