import type { AgenticTool } from './AgenticTool.ts'
import type { ChatSession } from './ChatSession.ts'
import type { LlmModel } from './LlmModel.ts'
import { Message } from './Message.ts'

export class AiAgent {
  name: string
  model: LlmModel
  tools: AgenticTool[]
  /** System prompt sent with every request. */
  instructions: string
  private session: ChatSession | null = null
  private unsubscribe: (() => void) | null = null

  constructor(name: string, model: LlmModel, tools: AgenticTool[] = [], instructions = '') {
    this.name = name
    this.model = model
    this.tools = tools
    this.instructions = instructions
  }

  /**
   * Listens to `session` and replies to every message not sent by this agent.
   * The session never calls the agent directly; it only emits events.
   */
  attach(session: ChatSession): void {
    this.detach()
    this.session = session
    this.unsubscribe = session.on('message', (message) => {
      if (message.sender === this.name) return
      this.respond(message)
        .then((reply) => session.send(reply))
        .catch((error: unknown) => session.reportError(error))
    })
  }

  detach(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.session = null
  }

  async respond(message: Message): Promise<Message> {
    const history = this.session ? this.session.messages : [message]
    const contents = await this.model.complete(history, this.tools, this.instructions)
    return new Message({ sender: this.name, contents })
  }
}
