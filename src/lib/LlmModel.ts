import type { AgenticTool } from './AgenticTool.ts'
import type { Message } from './Message.ts'
import type { MessagePart } from './MessagePart.ts'

export abstract class LlmModel {
  name: string

  constructor(name: string) {
    this.name = name
  }

  /**
   * Produces the next reply to `history`. Implementations own the provider's
   * API call and any tool-calling loop over `tools`. `instructions` is the
   * system prompt; empty means none.
   */
  abstract complete(history: Message[], tools: AgenticTool[], instructions?: string): Promise<MessagePart[]>
}
