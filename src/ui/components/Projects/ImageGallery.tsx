import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import style from './projects.module.css'

type LoadState = 'loading' | 'loaded' | 'error'

// One lazily loaded image: skeleton until it arrives, a placeholder if it fails. Remount (key) on src change.
const LazyImage = ({ src, alt, className, eager }: { src: string; alt: string; className?: string; eager?: boolean }) => {
  const [state, setState] = useState<LoadState>('loading')
  return (
    <span className={`${style.imgWrap} ${className ?? ''}`} data-state={state}>
      {state === 'error' ? (
        <span className={style.imgError}>Image unavailable</span>
      ) : (
        <img
          src={src}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding='async'
          onLoad={() => setState('loaded')}
          onError={() => setState('error')}
        />
      )}
    </span>
  )
}

// Only one lightbox open at a time: opening one closes the previous.
let closeOpen: (() => void) | null = null

// Main image in a fixed-ratio frame (any aspect ratio fits without layout shift), a thumbnail strip, and a lightbox.
export const ImageGallery = ({ images, title }: { images: string[]; title: string }) => {
  const [index, setIndex] = useState(0)
  const [zoomed, setZoomed] = useState(false)
  const strip = useRef<HTMLDivElement>(null)
  const count = images.length
  const go = useCallback((delta: number) => setIndex(i => (i + delta + count) % count), [count])
  const label = (i: number) => `${title} image ${i + 1} of ${count}`

  // Keep the selected thumbnail in view, scrolling only the strip (not the page).
  useEffect(() => {
    const el = strip.current
    const thumb = el?.children[index] as HTMLElement | undefined
    if (!el || !thumb) return
    const left = thumb.offsetLeft - (el.clientWidth - thumb.clientWidth) / 2
    el.scrollTo({ left, behavior: 'smooth' })
  }, [index])

  useEffect(() => {
    if (!zoomed) return
    const close = () => setZoomed(false)
    closeOpen?.()
    closeOpen = close
    return () => {
      if (closeOpen === close) closeOpen = null
    }
  }, [zoomed])

  useEffect(() => {
    if (!zoomed) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setZoomed(false)
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoomed, go])

  const onKey = (e: KeyboardEvent) => {
    if (zoomed) return
    if (e.key === 'ArrowRight') go(1)
    if (e.key === 'ArrowLeft') go(-1)
  }

  const navButtons = (stop: boolean) => (
    <>
      <button
        type='button'
        className={`${style.nav} ${style.prev}`}
        onClick={e => {
          if (stop) e.stopPropagation()
          go(-1)
        }}
        aria-label='Previous image'>
        ‹
      </button>
      <button
        type='button'
        className={`${style.nav} ${style.next}`}
        onClick={e => {
          if (stop) e.stopPropagation()
          go(1)
        }}
        aria-label='Next image'>
        ›
      </button>
    </>
  )

  return (
    <div className={style.gallery} onKeyDown={onKey}>
      <div className={style.stageFrame}>
        <button type='button' className={style.mainButton} onClick={() => setZoomed(true)} aria-label={`Enlarge ${label(index)}`}>
          <LazyImage key={`${index}-${images[index]}`} src={images[index]} alt={label(index)} className={style.mainImage} />
        </button>
        {count > 1 && (
          <>
            {navButtons(false)}
            <span className={style.counter}>
              {index + 1}/{count}
            </span>
          </>
        )}
      </div>
      {count > 1 && (
        <div className={style.thumbs} ref={strip} aria-label={`${title} images`}>
          {images.map((src, i) => (
            <button
              key={`${i}-${src}`}
              type='button'
              aria-current={i === index}
              aria-label={`Show ${label(i)}`}
              className={style.thumb}
              onClick={() => setIndex(i)}>
              <LazyImage src={src} alt='' />
            </button>
          ))}
        </div>
      )}
      {zoomed &&
        createPortal(
          <div className={style.lightbox} onClick={() => setZoomed(false)}>
            <div className={style.popup} role='dialog' aria-modal='true' aria-label={label(index)} onClick={e => e.stopPropagation()}>
              <div className={style.popupHeader}>
                <span className={style.popupTitle}>{title}</span>
                {count > 1 && (
                  <span className={style.popupCount}>
                    {index + 1}/{count}
                  </span>
                )}
                <button type='button' className={style.close} onClick={() => setZoomed(false)} aria-label='Close' autoFocus>
                  ×
                </button>
              </div>
              <div className={style.popupStage}>
                <LazyImage key={`z-${index}-${images[index]}`} src={images[index]} alt={label(index)} className={style.popupImage} eager />
                {count > 1 && navButtons(false)}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
