import {
  db,
  type ChatSessionRecord,
  type DiagramRecord,
  type MessagePartRecord,
  type MessageRecord,
  type ProviderRecord,
} from '../db.ts'
import {
  AiAgent,
  ChatSession,
  Diagram,
  DiagramReference,
  Message,
  MessagePart,
  parseReply,
  type AgentStep,
} from '../lib/index.ts'
import { providerKinds } from '../providers.ts'
import { NEW_CHAT_TITLE, titleFrom } from './chatTitle.ts'
import { endReply, startReply, updateReply } from './replies.ts'
import { AGENT_NAME, SYSTEM_PROMPT } from './systemPrompt.ts'
import { checkDiagrams, diagramTools, sameName } from './tools.ts'

/** No LLM provider is configured, so the agent can't reply. */
export class NoProviderError extends Error {
  constructor() {
    super('Add an LLM provider in Settings so GraphiteAI can reply.')
    this.name = 'NoProviderError'
  }
}

/** Stores the user's message (naming a new chat after it), then gets the agent's reply. */
export async function sendMessage(chatSessionId: number, content: string): Promise<void> {
  await db.transaction('rw', db.messages, db.chatSessions, async () => {
    await db.messages.add({
      chatSessionId,
      sender: 'user',
      on: new Date(),
      isSent: true,
      parts: [{ type: 'text', content }],
    })
    const session = await db.chatSessions.get(chatSessionId)
    if (session?.title === NEW_CHAT_TITLE) {
      await db.chatSessions.update(chatSessionId, { title: titleFrom(content) })
    }
  })
  await reply(chatSessionId)
}

/**
 * Has the agent answer the chat's last message, if it's an unanswered user
 * message, and stores the reply. The agent works through tool calls and has
 * its diagrams checked before answering; progress streams to `replies.ts`.
 * Mermaid blocks in the reply become project Diagrams; a diagram titled like
 * an existing one replaces its source. A stopped reply saves nothing.
 */
export async function reply(chatSessionId: number): Promise<void> {
  const session = await db.chatSessions.get(chatSessionId)
  if (!session) throw new Error('Chat not found.')
  const records = await db.messages.where({ chatSessionId }).sortBy('on')
  const last = records.at(-1)
  if (!last || last.sender !== 'user') return

  const provider = await providerFor(session)
  if (!provider) throw new NoProviderError()
  const model = providerKinds[provider.kind].create().provideModel(provider.args)

  const controller = startReply(chatSessionId)
  if (!controller) return // Already being answered.
  try {
    const diagrams = await db.diagrams.where({ projectId: session.projectId }).toArray()
    const history = records.map((record) => toMessage(record, diagrams))

    // The agent reacts to the session's `message` event rather than being called directly.
    const chat = new ChatSession()
    chat.messages = history.slice(0, -1)
    let steps: AgentStep[] = []
    chat.on('progress', (progress) => {
      steps = progress.steps
      updateReply(chatSessionId, progress)
    })
    const agent = new AiAgent(AGENT_NAME, model, diagramTools(session.projectId), SYSTEM_PROMPT, {
      checkAnswer: checkDiagrams,
      signal: controller.signal,
    })
    const answer = await new Promise<Message>((resolve, reject) => {
      chat.on('message', (message) => {
        if (message.sender === AGENT_NAME) resolve(message)
      })
      chat.on('error', reject)
      chat.setAgent(agent)
      chat.send(history[history.length - 1])
    }).finally(() => chat.setAgent(null))

    await saveReply(session, provider, answer, steps)
  } catch (error) {
    if (controller.signal.aborted) return
    throw error
  } finally {
    endReply(chatSessionId)
  }
}

async function providerFor(session: ChatSessionRecord): Promise<ProviderRecord | undefined> {
  const chosen = session.providerId === undefined ? undefined : await db.providers.get(session.providerId)
  return chosen ?? (await db.providers.orderBy(':id').first())
}

function toMessage(record: MessageRecord, diagrams: DiagramRecord[]): Message {
  const contents = record.parts.flatMap((part): MessagePart[] => {
    if (part.type !== 'diagram-reference') return [new MessagePart(part.type, part.content)]
    const diagram = diagrams.find((d) => d.id === part.diagramId)
    return diagram ? [new DiagramReference(new Diagram(diagram.type, diagram.name, diagram.source))] : []
  })
  return new Message({ sender: record.sender, contents, on: record.on, isSent: record.isSent })
}

async function saveReply(session: ChatSessionRecord, provider: ProviderRecord, answer: Message, steps: AgentStep[]) {
  const text = answer.contents.map((part) => part.content).join('\n\n')
  const segments = parseReply(text)
  if (segments.length === 0) throw new Error('The model returned an empty reply.')

  await db.transaction('rw', db.messages, db.diagrams, db.chatSessions, async () => {
    // The chat may have been deleted while the model was answering.
    if (!(await db.chatSessions.get(session.id))) return
    const parts: MessagePartRecord[] = []
    for (const segment of segments) {
      if (segment.kind === 'text') parts.push({ type: 'text', content: segment.content })
      else if (segment.kind === 'code') {
        parts.push({ type: 'code', content: segment.content, language: segment.language || undefined })
      } else {
        const { name, type, source } = segment
        const existing = await db.diagrams
          .where({ projectId: session.projectId })
          .filter((d) => sameName(d.name, name))
          .first()
        const diagramId = existing
          ? (await db.diagrams.update(existing.id, { type, source }), existing.id)
          : await db.diagrams.add({ projectId: session.projectId, type, name, source })
        parts.push({ type: 'diagram-reference', diagramId })
      }
    }
    await db.messages.add({
      chatSessionId: session.id,
      sender: AGENT_NAME,
      on: new Date(),
      isSent: true,
      parts,
      ...(steps.length > 0 && { steps }),
    })
    // Keep using this provider for the chat even if another one is added first later.
    if (session.providerId !== provider.id) await db.chatSessions.update(session.id, { providerId: provider.id })
  })
}
