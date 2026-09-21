import { describe, expect, it } from 'vitest'
import { Diagram } from './Diagram.ts'
import { DiagramReference } from './DiagramReference.ts'
import { Message } from './Message.ts'
import { MessagePart } from './MessagePart.ts'
import { escapeHtml } from './Renderable.ts'

describe('escapeHtml', () => {
  it('escapes every HTML-significant character', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    )
  })
})

describe('MessagePart', () => {
  it('renders text as an escaped paragraph with line breaks', () => {
    expect(new MessagePart('text', '<b>hi</b>\nthere').render()).toBe('<p>&lt;b&gt;hi&lt;/b&gt;<br>there</p>')
  })

  it('renders text as Markdown', () => {
    expect(new MessagePart('text', '- **Book**\n- Loan').render()).toBe(
      '<ul><li><strong>Book</strong></li><li>Loan</li></ul>',
    )
  })

  it('renders code as an escaped pre block', () => {
    expect(new MessagePart('code', 'a < b').render()).toBe('<pre><code>a &lt; b</code></pre>')
  })
})

describe('Diagram', () => {
  it('renders an escaped figure with its type, name and source', () => {
    const html = new Diagram('mermaid', 'Flow <1>', 'A-->B').render()
    expect(html).toContain('data-type="mermaid"')
    expect(html).toContain('<figcaption>Flow &lt;1&gt;</figcaption>')
    expect(html).toContain('<pre>A--&gt;B</pre>')
  })
})

describe('DiagramReference', () => {
  it('is a MessagePart that renders the referenced diagram', () => {
    const diagram = new Diagram('mermaid', 'Flow', 'A-->B')
    const reference = new DiagramReference(diagram)

    expect(reference).toBeInstanceOf(MessagePart)
    expect(reference.type).toBe('diagram-reference')
    expect(reference.render()).toBe(diagram.render())
  })

  it('reflects later changes to the diagram', () => {
    const diagram = new Diagram('mermaid', 'Flow', 'old')
    const reference = new DiagramReference(diagram)
    diagram.source = 'new'

    expect(reference.render()).toContain('new')
  })
})

describe('Message', () => {
  it('defaults to an unsent message with no contents', () => {
    const message = new Message({ sender: 'user' })
    expect(message.isSent).toBe(false)
    expect(message.contents).toEqual([])
    expect(message.on).toBeInstanceOf(Date)
  })

  it('renders its parts in order', () => {
    const message = new Message({
      sender: 'user',
      contents: [new MessagePart('text', 'one'), new MessagePart('code', 'two')],
    })
    expect(message.render()).toBe('<p>one</p><pre><code>two</code></pre>')
  })
})
