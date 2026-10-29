import type { ReactNode } from 'react'
import { useAppSelector } from '../../../state/hooks'

// Center area between header and footer (formerly the Three.js canvas).
export const Stage = ({
  className,
  children
}: {
  className?: string
  children?: ReactNode
}) => {
  const ready = useAppSelector(s => s.ui.ready)
  return (
    <main id='stage' className={className} data-ready={ready}>
      {children}
    </main>
  )
}
