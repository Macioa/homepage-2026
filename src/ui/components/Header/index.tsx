import style from '../../styles.module.css'

export const Header = () => (
  <header className={style.header}>
    <h1 className={style.name}>Ryan Montgomery</h1>
    <p className={style.subtitle}>Software Engineering</p>
    <p className={style.tagline}>
      {['Web', 'Distributed', 'Data', 'Agentic'].map(t => (
        <span key={t}>{t}</span>
      ))}
    </p>
  </header>
)
