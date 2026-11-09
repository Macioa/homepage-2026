import type { Project } from '../../../connections/projects'
import style from './projects.module.css'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

type PartialDate = { day?: number; month?: number; year?: number }

const pad = (n: number) => String(n).padStart(2, '0')

// Shows only the parts present: "2019", "Jan 2022", "Mar 14, 2023". No year, no date.
function formatPartialDate({ day, month, year }: PartialDate) {
  if (!year) return null
  const mon = month && month >= 1 && month <= 12 ? MONTHS[month - 1] : null
  if (!mon) return { text: String(year), iso: String(year) }
  if (!day) return { text: `${mon} ${year}`, iso: `${year}-${pad(month!)}` }
  return { text: `${mon} ${day}, ${year}`, iso: `${year}-${pad(month!)}-${pad(day)}` }
}

// Start and end as given. A start without an end is ongoing (same rule as the resume tables).
export const ProjectDates = ({ project: p }: { project: Project }) => {
  const start = formatPartialDate({ day: p.start_day, month: p.start_month, year: p.start_year })
  const end = formatPartialDate({ day: p.end_day, month: p.end_month, year: p.end_year })
  if (!start && !end) return null
  const time = (d: { text: string; iso: string }) => <time dateTime={d.iso}>{d.text}</time>
  return (
    <p className={style.dates}>
      {start && end ? (
        start.text === end.text ? (
          time(start)
        ) : (
          <>
            {time(start)} – {time(end)}
          </>
        )
      ) : start ? (
        <>{time(start)} – Present</>
      ) : (
        time(end!)
      )}
    </p>
  )
}
