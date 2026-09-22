import { Attachment } from './Attachment.ts'
import { DiagramReference } from './DiagramReference.ts'
import type { Message } from './Message.ts'
import type { MessagePart } from './MessagePart.ts'
import type { Args } from './Parametered.ts'

/** A tool the model asked to run. `id` pairs it with its result. */
export type ToolCall = { id: string; name: string; args: Args }

export type ToolResult = { callId: string; name: string; content: string; isError?: boolean }

/** An image or PDF for the model to see natively (text files are inlined into the turn instead). */
export type TurnAttachment = { name: string; mediaType: string; data: string }

/**
 * A plain user or assistant turn: what stored chat messages become. User turns
 * can carry images and PDFs.
 */
export type TextTurn = { role: 'user' | 'assistant'; content: string; attachments?: TurnAttachment[] }

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
 * mermaid source so the model can revise them; diagrams the user references
 * are labeled with their title. Attached text files are inlined, and images
 * and PDFs become the turn's `attachments`. Empty messages are dropped.
 */
export function toChatTurns(history: Message[]): TextTurn[] {
  return history.flatMap((message): TextTurn[] => {
    const role = message.sender === 'user' ? 'user' : 'assistant'
    const content = message.contents
      .map((part) => partText(part, role))
      .filter(Boolean)
      .join('\n\n')
    const attachments = message.contents.flatMap((part): TurnAttachment[] =>
      part instanceof Attachment && part.kind !== 'text'
        ? [{ name: part.name, mediaType: part.mediaType, data: part.data }]
        : [],
    )
    if (!content && attachments.length === 0) return []
    return [{ role, content, ...(attachments.length > 0 && { attachments }) }]
  })
}

/** A note for models that can't read the PDFs in `attachments`; empty if there are none. */
export function unreadablePdfNote(attachments: TurnAttachment[] = []): string {
  const pdfs = attachments.filter((a) => a.mediaType === 'application/pdf').map((a) => `"${a.name}"`)
  if (pdfs.length === 0) return ''
  return `(The user attached ${pdfs.join(', ')}, but this model can't read PDFs.)`
}

function partText(part: MessagePart, role: TextTurn['role']): string {
  if (part instanceof DiagramReference) {
    const source = fence('mermaid', part.diagram.source)
    return role === 'user' ? `Referenced diagram "${part.diagram.name}":\n${source}` : source
  }
  if (part instanceof Attachment) return part.kind === 'text' ? `Attached file "${part.name}":\n${fence('', part.text())}` : ''
  if (part.type === 'code') return fence('', part.content)
  if (part.type === 'text') return part.content
  return ''
}

/** `content` in a code fence longer than any backtick run inside it. */
function fence(language: string, content: string): string {
  const longest = Math.max(0, ...(content.match(/`+/g) ?? []).map((run) => run.length))
  const ticks = '`'.repeat(Math.max(3, longest + 1))
  return `${ticks}${language}\n${content}\n${ticks}`
}
