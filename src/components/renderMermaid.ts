import type { Mermaid } from 'mermaid'

let mermaid: Promise<Mermaid> | undefined
let renders = 0

/**
 * Draws Mermaid `source` as an SVG string. Mermaid is large, so it's loaded on
 * first use. `securityLevel: 'strict'` makes Mermaid sanitize labels and
 * disables click handlers, so the SVG is safe to inject.
 */
export async function renderMermaid(source: string): Promise<string> {
  mermaid ??= import('mermaid').then((module) => module.default)
  const api = await mermaid
  api.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'neutral',
    fontFamily: "system-ui, 'Segoe UI', Roboto, sans-serif",
  })
  const id = `graphite-mermaid-${++renders}`
  try {
    const { svg } = await api.render(id, source)
    return svg
  } finally {
    // A failed render can leave its scratch element behind.
    document.getElementById(`d${id}`)?.remove()
  }
}
