import { useEffect, useRef } from 'react'
import style from '../../styles.module.css'
import { mountNeonName } from './neonName'

const NAME = 'Ryan Montgomery'

export const Header = () => {
  const neon = useRef<HTMLDivElement>(null)
  useEffect(() => (neon.current ? mountNeonName(neon.current, NAME) : undefined), [])
  return (
    <header className={style.header}>
      <h1 className={style.srOnly}>{NAME}</h1>
      <div ref={neon} className={style.neonName} />
      <p className={style.subtitle}>Software Engineering</p>
      <p className={style.subsubtitle}>(20+ years software, 8+ distributed systems)</p>
      <p className={style.tagline}>
        {['Web', 'Distributed', 'Data/Backend', 'Agentic'].map(t => (
          <span key={t}>{t}</span>
        ))}
      </p>
    </header>
  )
}
