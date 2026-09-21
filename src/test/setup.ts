// Registers jest-dom matchers (toBeInTheDocument, ...) on Vitest's expect.
import '@testing-library/jest-dom/vitest'
// In-memory IndexedDB so Dexie works under jsdom.
import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest globals are off, so Testing Library can't register its own auto-cleanup.
afterEach(() => {
  cleanup()
})
