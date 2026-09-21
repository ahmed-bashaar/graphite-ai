import type { Message } from './Message.ts'

/** The role/content shape every chat-completion API accepts. */
export type ChatTurn = { role: 'user' | 'assistant'; content: string }

/**
 * Flattens `history` into chat turns. Messages from `'user'` are user turns;
 * every other sender is the agent. Diagram references and empty messages are dropped.
 */
export function toChatTurns(history: Message[]): ChatTurn[] {
  return history.flatMap((message): ChatTurn[] => {
    const content = message.contents
      .filter((part) => part.type !== 'diagram-reference')
      .map((part) => part.content)
      .join('\n\n')
    if (!content) return []
    return [{ role: message.sender === 'user' ? 'user' : 'assistant', content }]
  })
}
