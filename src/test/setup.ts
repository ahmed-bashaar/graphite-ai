// Registers jest-dom matchers (toBeInTheDocument, ...) on Vitest's expect.
import '@testing-library/jest-dom/vitest'
// In-memory IndexedDB so Dexie works under jsdom.
import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Vitest globals are off, so Testing Library can't register its own auto-cleanup.
afterEach(() => {
  cleanup()
})

// Mermaid needs real layout (SVG text measurement), which jsdom lacks. Tests get
// a stand-in SVG that echoes the source; override per test with vi.mocked().
vi.mock('../components/renderMermaid.ts', () => ({
  renderMermaid: vi.fn(
    async (source: string) =>
      `<svg data-testid="mermaid-svg"><text>${source.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></svg>`,
  ),
}))
