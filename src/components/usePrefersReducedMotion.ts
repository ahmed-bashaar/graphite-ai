import { useSyncExternalStore } from 'react'

const query = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void) {
  if (typeof matchMedia !== 'function') return () => {}
  const list = matchMedia(query)
  list.addEventListener('change', onChange)
  return () => list.removeEventListener('change', onChange)
}

function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia(query).matches
}

/** Whether the OS asks for reduced motion. Scripted effects (typing, streaming) check this; Motion's own animations follow `MotionConfig`. */
export function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false)
}
