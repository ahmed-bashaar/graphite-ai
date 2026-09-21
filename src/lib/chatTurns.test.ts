import { describe, expect, it } from 'vitest'
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
})
