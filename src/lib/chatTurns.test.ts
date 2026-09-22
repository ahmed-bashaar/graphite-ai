import { describe, expect, it } from 'vitest'
import { Attachment, toBase64 } from './Attachment.ts'
import { toChatTurns } from './chatTurns.ts'
import { Diagram } from './Diagram.ts'
import { DiagramReference } from './DiagramReference.ts'
import { Message } from './Message.ts'
import { MessagePart } from './MessagePart.ts'

describe('toChatTurns', () => {
  it('maps user messages to user turns and everyone else to assistant turns', () => {
    const turns = toChatTurns([
      new Message({ sender: 'user', contents: [new MessagePart('text', 'hi')] }),
      new Message({ sender: 'GraphiteAI', contents: [new MessagePart('text', 'hello')] }),
    ])
    expect(turns).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ])
  })

  it('shows referenced diagrams to the model as fenced mermaid source', () => {
    const diagram = new Diagram('class', 'Domain', 'classDiagram\n  class Book')
    const [turn] = toChatTurns([
      new Message({
        sender: 'GraphiteAI',
        contents: [new MessagePart('text', 'Here:'), new DiagramReference(diagram)],
      }),
    ])
    expect(turn.content).toBe('Here:\n\n```mermaid\nclassDiagram\n  class Book\n```')
  })

  it('keeps code parts as fenced code and drops empty messages', () => {
    const turns = toChatTurns([
      new Message({ sender: 'GraphiteAI', contents: [new MessagePart('code', 'x = 1')] }),
      new Message({ sender: 'user' }),
    ])
    expect(turns).toEqual([{ role: 'assistant', content: '```\nx = 1\n```' }])
  })

  it('inlines text files into the turn and passes images and PDFs on as attachments', () => {
    const png = { name: 'sketch.png', mediaType: 'image/png', data: 'iVBORw0KGgo=' }
    const pdf = { name: 'spec.pdf', mediaType: 'application/pdf', data: 'JVBERi0=' }
    const [turn] = toChatTurns([
      new Message({
        sender: 'user',
        contents: [
          new MessagePart('text', 'Model this'),
          new Attachment({ name: 'notes.md', mediaType: 'text/markdown', data: toBase64('Books have authors') }),
          new Attachment(png),
          new Attachment(pdf),
        ],
      }),
    ])
    expect(turn).toEqual({
      role: 'user',
      content: 'Model this\n\nAttached file "notes.md":\n```\nBooks have authors\n```',
      attachments: [png, pdf],
    })
  })

  it('keeps a message that only has attachments, and fences files containing backticks safely', () => {
    const turns = toChatTurns([
      new Message({ sender: 'user', contents: [new Attachment({ name: 'a.png', mediaType: 'image/png', data: 'AA==' })] }),
      new Message({
        sender: 'user',
        contents: [new Attachment({ name: 'r.md', mediaType: 'text/markdown', data: toBase64('```js\nx\n```') })],
      }),
    ])
    expect(turns[0]).toEqual({
      role: 'user',
      content: '',
      attachments: [{ name: 'a.png', mediaType: 'image/png', data: 'AA==' }],
    })
    expect(turns[1].content).toBe('Attached file "r.md":\n````\n```js\nx\n```\n````')
  })

  it('shows diagrams the user references to the model with their title', () => {
    const diagram = new Diagram('class', 'Domain', 'classDiagram\n  class Book')
    const [turn] = toChatTurns([
      new Message({ sender: 'user', contents: [new DiagramReference(diagram), new MessagePart('text', 'Add Loan')] }),
    ])
    expect(turn.content).toBe('Referenced diagram "Domain":\n```mermaid\nclassDiagram\n  class Book\n```\n\nAdd Loan')
  })
})
