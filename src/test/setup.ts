// Registers jest-dom matchers (toBeInTheDocument, ...) on Vitest's expect.
import '@testing-library/jest-dom/vitest'
// In-memory IndexedDB so Dexie works under jsdom.
import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Node 25 defines its own `localStorage` (an empty stub without --localstorage-file)
// that hides jsdom's. Swap in a working in-memory Storage.
if (typeof globalThis.localStorage?.clear !== 'function') {
  class MemoryStorage implements Storage {
    private items = new Map<string, string>()
    get length() {
      return this.items.size
    }
    clear() {
      this.items.clear()
    }
    getItem(key: string) {
      return this.items.get(key) ?? null
    }
    key(index: number) {
      return [...this.items.keys()][index] ?? null
    }
    removeItem(key: string) {
      this.items.delete(key)
    }
    setItem(key: string, value: string) {
      this.items.set(key, String(value))
    }
  }
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true })
}

// Vitest globals are off, so Testing Library can't register its own auto-cleanup.
afterEach(() => {
  cleanup()
})

// Mermaid needs real layout (SVG text measurement), which jsdom lacks. Tests get
// a stand-in SVG that echoes the source, and every diagram is valid; override
// per test with vi.mocked().
vi.mock('../components/renderMermaid.ts', () => ({
  renderMermaid: vi.fn(
    async (source: string) =>
      `<svg data-testid="mermaid-svg"><text>${source.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></svg>`,
  ),
  validateMermaid: vi.fn(async () => null),
}))
