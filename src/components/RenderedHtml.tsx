import type { Renderable } from '../lib/index.ts'

/**
 * Injects a Renderable's markup. Safe because render() escapes all
 * LLM-produced text (see escapeHtml in src/lib/Renderable.ts).
 */
export function RenderedHtml({ of, className }: { of: Renderable; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: of.render() }} />
}
