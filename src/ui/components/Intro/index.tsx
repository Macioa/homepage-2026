import { useState } from 'react'
import style from './intro.module.css'

const VIDEOS = ['https://youtu.be/StFlPZ602tQ', 'https://youtu.be/J9gKyRmic20']

// Wide enough for a 16:9 player beside the chat column; checked once on launch only.
const WIDE_ASPECT = 1.6
const MIN_WIDTH = 1100
const fitsVideo = () => window.innerWidth >= MIN_WIDTH && window.innerWidth / window.innerHeight >= WIDE_ASPECT

const embedUrl = (short: string) => `https://www.youtube.com/embed/${short.split('/').pop()}?autoplay=1&playsinline=1`

// Disclaimer popup on launch; on wide screens, also a video pane that starts (with sound) when OK is clicked.
export const Intro = () => {
  const [showVideo] = useState(fitsVideo)
  const [video] = useState(() => VIDEOS[Math.floor(Math.random() * VIDEOS.length)])
  const [accepted, setAccepted] = useState(false)

  return (
    <>
      {showVideo && (
        <section className={style.video} aria-label='Video'>
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
      {!accepted && (
        <div className={style.backdrop}>
          <div className={style.dialog} role='dialog' aria-modal='true' aria-labelledby='disclaimer-title'>
            <h2 id='disclaimer-title'>Disclaimer</h2>
            <p>Disclaimer text coming soon.</p>
            <button type='button' autoFocus onClick={() => setAccepted(true)}>
              OK
            </button>
          </div>
        </div>
      )}
    </>
  )
}
