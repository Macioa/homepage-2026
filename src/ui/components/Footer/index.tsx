import style from '../../styles.module.css'
import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { toggleProjects } from '../../../state'

import linkedin from '../../images/linkedin.svg'
// import ga from '../../images/ga.svg'
import github from '../../images/github.svg'
import twitter from '../../images/twitter.svg'
import mail from '../../images/mail.svg'
import projects from '../../images/projects.svg'
import recommendations from '../../images/recommendations.svg'
import calendly from '../../images/calendly.svg'
import socials from '../../images/socials.svg'
import { Popup } from '../Popup'

const toLinks = (links: { name: string, label: string, logo: string, url: string }[]) => links
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

export const footerLinks = toLinks([
  {
    name: 'Github',
    label: 'GitHub',
    logo: github,
    url: 'https://github.com/Macioa'
  }
])

export const socialLinks = toLinks([
  {
    name: 'Linked In',
    label: 'LinkedIn',
    logo: linkedin,
    url: 'https://linkedin.com/in/ryanwademontgomery'
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
  },
  {
    name: 'Recommendations',
    label: 'Recs',
    logo: recommendations,
    url: 'https://linkedin.com/in/ryanwademontgomery/details/recommendations/'
  },
  {
    name: 'Calendly',
    label: 'Calendly',
    logo: calendly,
    url: 'https://calendly.com/ryanwademontgomery'
  }
])

const SocialsPopup = () => (
  <Popup
    id='LinkSocials'
    triggerClassName={style.footerItem}
    trigger={<>
      <img src={socials} className={style.footerLink} alt='' />
      <span className={style.footerLabel}>Socials</span>
    </>}>
    {socialLinks}
  </Popup>
)

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
    <SocialsPopup />
    {footerLinks}
  </footer>
)
