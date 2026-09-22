import { type RefObject, useEffect, useState } from 'react'

/**
 * Becomes true once `amount` (0–1) of the element has scrolled into view, and
 * stays true. Without IntersectionObserver (jsdom) everything counts as in view.
 */
export function useInViewOnce(ref: RefObject<Element | null>, amount: number) {
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const element = ref.current
    if (inView || !element) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setInView(true)
      },
      { threshold: amount },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, amount, inView])
  return inView
}
