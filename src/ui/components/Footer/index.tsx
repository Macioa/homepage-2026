import style from '../../styles.module.css'
import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { toggleProjects } from '../../../state'

import linkedin from '../../images/linkedin.svg'
// import ga from '../../images/ga.svg'
import github from '../../images/github.svg'
import twitter from '../../images/twitter.svg'
import mail from '../../images/mail.svg'
import projects from '../../images/projects.svg'

export const footerLinks = [
  {
    name: 'Linked In',
    label: 'LinkedIn',
    logo: linkedin,
    url: 'https://linkedin.com/in/ryanwademontgomery'
  },
  // GA profiles is defunct. Link now redirects to hired.com
  // {
  //   name: 'General Assembly',
  //   logo: ga,
  //   url: 'https://profiles.generalassemb.ly/ryan-montgomery'
  // },
  {
    name: 'Github',
    label: 'GitHub',
    logo: github,
    url: 'https://github.com/Macioa'
  },
  {
    name: 'Twitter',
    label: 'Twitter',
    logo: twitter,
    url: 'https://twitter.com/macioa_macioa'
  },
  {
    name: 'Mail',
    label: 'Mail',
    logo: mail,
    url: 'mailto:development@ryanwademontgomery.com'
  }
]
  .filter(e => e.logo && e.url)
  .map((e, i) => (
    <a
      id={`Link${e.name.replace(' ', '')}`}
      key={`Link${i}`}
      href={e.url}
      target='_blank'
      rel='noopener noreferrer'
      className={style.footerItem}>
      <img src={e.logo} className={style.footerLink} alt='' />
      <span className={style.footerLabel}>{e.label}</span>
    </a>
  ))

// Unlike the links, this swaps the stage between chat and projects; it glows while projects is open.
const ProjectsButton = () => {
  const dispatch = useAppDispatch()
  const active = useAppSelector(s => s.ui.view === 'projects')
  return (
    <button
      id='LinkProjects'
      type='button'
      className={`${style.footerItem} ${style.footerButton}`}
      aria-pressed={active}
      title={active ? 'Back to chat' : 'Projects'}
      onClick={() => dispatch(toggleProjects())}>
      <img src={projects} className={style.footerLink} alt='' />
      <span className={style.footerLabel}>Projects</span>
    </button>
  )
}

export const Footer = () => (
  <footer className={style.footer} id={style.footer}>
    <ProjectsButton />
    {footerLinks}
  </footer>
)
