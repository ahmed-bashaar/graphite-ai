import type { AgenticTool } from './AgenticTool.ts'
import type { ChatTurn, ToolCall } from './chatTurns.ts'

export type StepOptions = {
  /** Empty or missing means no system prompt. */
  systemPrompt?: string
  /** Called with each piece of reply text as it streams in. */
  onText?: (delta: string) => void
  /** Called with each piece of the model's reasoning, for models that share it. */
  onThinking?: (delta: string) => void
  signal?: AbortSignal
}

/** One model turn: its text, and the tools it wants to run (none means it's done). */
export type ModelStep = { text: string; toolCalls: ToolCall[]; native?: unknown }

export abstract class LlmModel {
  name: string

  constructor(name: string) {
    this.name = name
  }

  /**
   * Streams the model's next turn after `turns`, offering it `tools`. This is
   * one step of the agent loop (which lives in AiAgent); implementations own
   * the provider's API call and map the neutral turns to its format.
   */
  abstract step(turns: ChatTurn[], tools: AgenticTool[], options?: StepOptions): Promise<ModelStep>
}
