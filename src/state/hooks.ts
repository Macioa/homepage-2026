import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '.'
import { selectActiveCalls, selectSendLocked, USAGE_LIMIT } from './usage'

export const useAppDispatch = useDispatch.withTypes<AppDispatch>()
export const useAppSelector = useSelector.withTypes<RootState>()

const USAGE_TICK_MS = 1_000

// The Gemini rate window as of now: calls in it, the limit, and whether Send is locked. Ticks each
// second while a call is still in the window or the lock is on, so the bar drains as calls expire.
export function useGeminiUsage() {
  const usage = useAppSelector(s => s.usage)
  const [now, setNow] = useState(Date.now)
  const used = selectActiveCalls({ usage }, now).length
  const locked = selectSendLocked({ usage }, now)
  const pending = used > 0 || locked
  useEffect(() => {
    if (!pending) return
    const timer = setTimeout(() => setNow(Date.now()), USAGE_TICK_MS)
    return () => clearTimeout(timer)
  }, [now, pending])
  return { used, limit: USAGE_LIMIT, locked }
}
