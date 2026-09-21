import { escapeHtml, type Renderable } from './Renderable.ts'

export class Diagram implements Renderable {
  type: string
  name: string
  /** The diagram's ASCII source as produced by the LLM (e.g. Mermaid, PlantUML, DOT). */
  source: string

  constructor(type: string, name: string, source = '') {
    this.type = type
    this.name = name
    this.source = source
  }

  render(): string {
    // Fallback until per-type renderers (source → SVG) exist: show the escaped source.
    return (
      `<figure class="diagram" data-type="${escapeHtml(this.type)}">` +
      `<figcaption>${escapeHtml(this.name)}</figcaption>` +
      `<pre>${escapeHtml(this.source)}</pre>` +
      `</figure>`
    )
  }
}
