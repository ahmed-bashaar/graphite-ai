import { useState } from 'react'

/**
 * State kept in localStorage: a per-browser convenience (like a panel's size)
 * that survives reloads. Storage can be missing or blocked (private windows,
 * cleared site data), so failures fall back to `initial` and are otherwise
 * ignored. `parse` turns the stored value back into a T, or undefined if it's
 * unusable.
 */
export function useStoredState<T>(
  key: string,
  initial: T,
  parse: (stored: unknown) => T | undefined,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key)
      return (stored === null ? undefined : parse(JSON.parse(stored))) ?? initial
    } catch {
      return initial
    }
  })

  function store(next: T) {
    setValue(next)
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      // Not saved; it still applies until the page reloads.
    }
  }

  return [value, store]
}
