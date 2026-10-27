import style from '../../styles.module.css'

import linkedin from '../../images/linkedin.svg'
// import ga from '../../images/ga.svg'
import github from '../../images/github.svg'
import twitter from '../../images/twitter.svg'
import mail from '../../images/mail.svg'

export const footerLinks = [
  {
    name: 'Linked In',
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
    logo: github,
    url: 'https://github.com/Macioa'
  },
  {
    name: 'Twitter',
    logo: twitter,
    url: 'https://twitter.com/macioa_macioa'
  },
  {
    name: 'Mail',
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
      target='blank'>
      <img src={e.logo} className={style.footerLink} alt={e.name} />
    </a>
  ))

export const Footer = () => (
  <footer className={style.footer} id={style.footer}>
    {footerLinks}
  </footer>
)
