import { DiagramReference } from './DiagramReference.ts'
import type { Message } from './Message.ts'
import type { MessagePart } from './MessagePart.ts'

/** The role/content shape every chat-completion API accepts. */
export type ChatTurn = { role: 'user' | 'assistant'; content: string }

/**
 * Flattens `history` into chat turns. Messages from `'user'` are user turns;
 * every other sender is the agent. Referenced diagrams are included as fenced
 * mermaid source so the model can revise them. Empty messages are dropped.
 */
export function toChatTurns(history: Message[]): ChatTurn[] {
  return history.flatMap((message): ChatTurn[] => {
    const content = message.contents.map(partText).filter(Boolean).join('\n\n')
    if (!content) return []
    return [{ role: message.sender === 'user' ? 'user' : 'assistant', content }]
  })
}

/** `turns` preceded by a system turn, for APIs that take the system prompt as a message. */
export function withSystem(
  instructions: string,
  turns: ChatTurn[],
): Array<ChatTurn | { role: 'system'; content: string }> {
  return instructions ? [{ role: 'system', content: instructions }, ...turns] : turns
}

function partText(part: MessagePart): string {
  if (part instanceof DiagramReference) return fence('mermaid', part.diagram.source)
  if (part.type === 'code') return fence('', part.content)
  if (part.type === 'text') return part.content
  return ''
}

const fence = (language: string, content: string) => `\`\`\`${language}\n${content}\n\`\`\``
