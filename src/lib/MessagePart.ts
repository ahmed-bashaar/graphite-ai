import { escapeHtml, type Renderable } from './Renderable.ts'

export type MessagePartType = 'text' | 'code' | 'diagram-reference'

export class MessagePart implements Renderable {
  type: MessagePartType
  content: string

  constructor(type: MessagePartType, content: string) {
    this.type = type
    this.content = content
  }

  render(): string {
    switch (this.type) {
      case 'code':
        return `<pre><code>${escapeHtml(this.content)}</code></pre>`
      default:
        return `<p>${escapeHtml(this.content).replace(/\n/g, '<br>')}</p>`
    }
  }
}
