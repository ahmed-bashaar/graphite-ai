import type { AgentProgress, AiAgent } from './AiAgent.ts'
import { EventEmitter } from './EventEmitter.ts'
import type { Message } from './Message.ts'

export type ChatSessionEvents = {
  message: Message
  draft: Message | null
  error: unknown
  /** The agent's reply in the making (work so far and streamed text). */
  progress: AgentProgress
}

export class ChatSession extends EventEmitter<ChatSessionEvents> {
  draft: Message | null = null
  messages: Message[] = []
  agent: AiAgent | null = null

  constructor(agent?: AiAgent) {
    super()
    if (agent) this.setAgent(agent)
  }

  setAgent(agent: AiAgent | null): void {
    this.agent?.detach()
    this.agent = agent
    agent?.attach(this)
  }

  /** Stores `message` as the unsent draft (UML: `draft(message)`). */
  setDraft(message: Message | null): void {
    this.draft = message
    this.emit('draft', message)
  }

  /** Sends `message`, or the current draft when omitted, and notifies listeners. */
  send(message: Message | null = this.draft): void {
    if (!message) return
    if (message === this.draft) this.setDraft(null)
    message.isSent = true
    message.on = new Date()
    this.messages.push(message)
    this.emit('message', message)
  }

  reportError(error: unknown): void {
    this.emit('error', error)
  }

  reportProgress(progress: AgentProgress): void {
    this.emit('progress', progress)
  }
}
