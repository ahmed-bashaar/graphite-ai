import { DiagramReference } from './DiagramReference.ts'
import type { Message } from './Message.ts'
import type { MessagePart } from './MessagePart.ts'
import type { Args } from './Parametered.ts'

/** A tool the model asked to run. `id` pairs it with its result. */
export type ToolCall = { id: string; name: string; args: Args }

export type ToolResult = { callId: string; name: string; content: string; isError?: boolean }

/** A plain user or assistant turn: what stored chat messages become. */
export type TextTurn = { role: 'user' | 'assistant'; content: string }

/**
 * One turn of the provider-neutral transcript the agent loop builds. Assistant
 * turns can carry tool calls, and `native` holds the provider's own record of
 * the turn (e.g. Anthropic content blocks with thinking signatures) so the
 * provider can replay it unchanged.
 */
export type ChatTurn =
  | TextTurn
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[]; native?: unknown }
  | { role: 'tool'; results: ToolResult[] }

/**
 * Flattens `history` into chat turns. Messages from `'user'` are user turns;
 * every other sender is the agent. Referenced diagrams are included as fenced
 * mermaid source so the model can revise them. Empty messages are dropped.
 */
export function toChatTurns(history: Message[]): TextTurn[] {
  return history.flatMap((message): TextTurn[] => {
    const content = message.contents.map(partText).filter(Boolean).join('\n\n')
    if (!content) return []
    return [{ role: message.sender === 'user' ? 'user' : 'assistant', content }]
  })
}

function partText(part: MessagePart): string {
  if (part instanceof DiagramReference) return fence('mermaid', part.diagram.source)
  if (part.type === 'code') return fence('', part.content)
  if (part.type === 'text') return part.content
  return ''
}

const fence = (language: string, content: string) => `\`\`\`${language}\n${content}\n\`\`\``
