import { useState } from 'react'
import style from './intro.module.css'
import { Disclaimer } from './Disclaimer'
import { useAppSelector } from '../../../state/hooks'

const VIDEOS = ['https://youtu.be/StFlPZ602tQ', 'https://youtu.be/J9gKyRmic20']

// Wide enough for a 16:9 player beside the chat column; checked once on launch only.
const WIDE_ASPECT = 1.6
const MIN_WIDTH = 1100
const fitsVideo = () => window.innerWidth >= MIN_WIDTH && window.innerWidth / window.innerHeight >= WIDE_ASPECT

const embedUrl = (short: string) => `https://www.youtube.com/embed/${short.split('/').pop()}?autoplay=1&playsinline=1`

// Disclaimer popup on launch; on wide screens, also a video pane that starts (with sound) when OK is clicked.
// On the projects page the video fills the stage behind the project list.
export const Intro = () => {
  const [showVideo] = useState(fitsVideo)
  const [video] = useState(() => VIDEOS[Math.floor(Math.random() * VIDEOS.length)])
  const [accepted, setAccepted] = useState(false)
  const behind = useAppSelector(s => s.ui.view === 'projects')

  return (
    <>
      {showVideo && (
        <section className={behind ? `${style.video} ${style.behind}` : style.video} aria-label='Video' data-side-video={behind ? undefined : ''}>
          {accepted && (
            <iframe
              src={embedUrl(video)}
              title='YouTube video'
              allow='autoplay; encrypted-media; picture-in-picture; fullscreen'
              allowFullScreen
            />
          )}
        </section>
      )}
      {!accepted && <Disclaimer onAccept={() => setAccepted(true)} />}
    </>
  )
}
