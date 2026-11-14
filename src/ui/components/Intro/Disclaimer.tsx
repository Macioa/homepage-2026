import { useEffect, useState } from 'react'
import style from './disclaimer.module.css'

const LINES = [
  "I'm not tracking your visit or your chat, but Google and Netlify are. This site doesn't keep cookies.",
  'Ask about my experience or take a look at some of my projects.',
  'Thanks for coming. I hope you enjoy.',
]

const CHAR_MS = 14
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Count of characters typed so far across all lines; starts after `delay` ms.
const useTyped = (total: number, delay: number) => {
  const [count, setCount] = useState(() => (reducedMotion() ? total : 0))
  useEffect(() => {
    if (count >= total) return
    const id = setTimeout(() => setCount(c => c + 1), count === 0 ? delay : CHAR_MS)
    return () => clearTimeout(id)
  }, [count, total, delay])
  return count
}

// Slices LINES so only the first `count` characters show; the line being typed gets a cursor.
const typedLines = (count: number) => {
  let left = count
  return LINES.map(line => {
    const shown = line.slice(0, Math.max(0, left))
    const typing = left > 0 && left < line.length
    left -= line.length
    return { shown, typing, started: shown.length > 0 }
  })
}

const TOTAL = LINES.join('').length

type Props = { onAccept: () => void }

const ScreenReaderText = () => <p className={style.srOnly}>{LINES.join(' ')}</p>

// Monitor powering on: a line flashes, expands, then the text types itself out.
const Crt = ({ onAccept }: Props) => {
  const count = useTyped(TOTAL, 900)
  const done = count >= TOTAL
  return (
    <div className={style.crt} role='dialog' aria-modal='true' aria-labelledby='disclaimer-title'>
      <h2 id='disclaimer-title'>Hello World</h2>
      <ScreenReaderText />
      <div aria-hidden='true'>
        {typedLines(count).map((l, i) => l.started && (
          <p key={i}>{l.shown}{l.typing && <span className={style.cursor} />}</p>
        ))}
      </div>
      <button type='button' autoFocus onClick={onAccept} className={done ? style.ready : undefined}>
        [ Press Enter ]
      </button>
    </div>
  )
}

// Retro app window: text arrives as shell output, closed with a [Y/n] prompt.
const Terminal = ({ onAccept }: Props) => {
  const count = useTyped(TOTAL, 400)
  const done = count >= TOTAL

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'y' || e.key === 'Y') onAccept() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onAccept])

  return (
    <div className={style.term} role='dialog' aria-modal='true' aria-labelledby='disclaimer-title'>
      <div className={style.titleBar}>
        <span id='disclaimer-title'>disclaimer.txt</span>
        <span className={style.winButtons} aria-hidden='true'><i /><i /><i /></span>
      </div>
      <div className={style.termBody}>
        <ScreenReaderText />
        <p className={style.prompt} aria-hidden='true'>$ cat hello_world.txt</p>
        <div aria-hidden='true'>
          {typedLines(count).map((l, i) => l.started && (
            <p key={i}>{l.shown}{l.typing && <span className={style.cursor} />}</p>
          ))}
        </div>
        {done && <p className={style.prompt} aria-hidden='true'>$ continue?</p>}
        <button type='button' autoFocus onClick={onAccept}>
          [Y/n]{done && <span className={style.cursor} />}
        </button>
      </div>
    </div>
  )
}

const VARIANTS = [Crt, Terminal]

// Launch disclaimer; picks one of the two looks at random per page load.
export const Disclaimer = ({ onAccept }: Props) => {
  const [Variant] = useState(() => VARIANTS[Math.floor(Math.random() * VARIANTS.length)])
  return (
    <div className={style.backdrop}>
      <Variant onAccept={onAccept} />
    </div>
  )
}
