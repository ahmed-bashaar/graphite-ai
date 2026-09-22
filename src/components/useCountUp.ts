import { useEffect, useRef, useState } from 'react'

type CountUpOptions = {
  /** Counting starts (after `delay`) once this is true. */
  active: boolean
  /** Skip straight to `total`, e.g. for reduced motion. */
  instant?: boolean
  /** Milliseconds before the first step. */
  delay?: number
  /** Milliseconds before step `i` (0-based) counts. */
  stepMs: number | ((i: number) => number)
  /** Called once, when the count reaches `total`. */
  onDone?: () => void
}

/**
 * Counts from 0 to `total` on a timer: how many letters, tokens or items of a
 * scripted animation are showing. `useCountUp(1, { active, stepMs })` is a pause.
 */
export function useCountUp(total: number, { active, instant = false, delay = 0, stepMs, onDone }: CountUpOptions) {
  const [count, setCount] = useState(0)
  const latest = useRef({ stepMs, onDone })
  useEffect(() => {
    latest.current = { stepMs, onDone }
  })

  useEffect(() => {
    if (!active || instant) return
    if (count >= total) {
      latest.current.onDone?.()
      return
    }
    const { stepMs } = latest.current
    const wait = (typeof stepMs === 'function' ? stepMs(count) : stepMs) + (count === 0 ? delay : 0)
    const timer = setTimeout(() => setCount((n) => n + 1), wait)
    return () => clearTimeout(timer)
  }, [active, instant, count, total, delay])

  if (instant) return total
  return active ? count : 0
}
