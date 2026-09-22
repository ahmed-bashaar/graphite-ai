import type { AgenticTool } from './AgenticTool.ts'
import type { ChatSession } from './ChatSession.ts'
import { toChatTurns, type ChatTurn, type ToolCall, type ToolResult } from './chatTurns.ts'
import type { LlmModel, ModelStep } from './LlmModel.ts'
import { Message } from './Message.ts'
import { MessagePart } from './MessagePart.ts'
import type { Args } from './Parametered.ts'

/** Something the agent did while working on a reply, before answering. */
export type AgentStep =
  | { kind: 'thinking'; text: string }
  | { kind: 'note'; text: string }
  | { kind: 'tool'; name: string; args: Args; result?: string; isError?: boolean }
  | { kind: 'check'; text: string }

/** A reply in the making: the work so far, and the answer text streaming in. */
export type AgentProgress = { steps: AgentStep[]; draft: string }

export type AiAgentOptions = {
  /** Model calls allowed per reply. Default 12. */
  maxSteps?: number
  /**
   * Reviews a finished answer before it's sent. Returning feedback sends it
   * back to the model, which revises the answer; null accepts it.
   */
  checkAnswer?: (answer: string) => string | null | Promise<string | null>
  signal?: AbortSignal
}

const STEP_LIMIT_NOTICE =
  'You have reached the step limit for this reply. Reply to the user now with your best answer, without calling tools.'

export class AiAgent {
  name: string
  model: LlmModel
  tools: AgenticTool[]
  /** System prompt sent with every request. */
  systemPrompt: string
  private options: AiAgentOptions
  private session: ChatSession | null = null
  private unsubscribe: (() => void) | null = null

  constructor(name: string, model: LlmModel, tools: AgenticTool[] = [], systemPrompt = '', options: AiAgentOptions = {}) {
    this.name = name
    this.model = model
    this.tools = tools
    this.systemPrompt = systemPrompt
    this.options = options
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

  /**
   * The agentic loop: the model works through tool calls on its own, and its
   * answer is checked, until it gives an answer that passes. Only that answer
   * becomes the reply; the work leading to it is reported as progress.
   */
  async respond(message: Message): Promise<Message> {
    const { maxSteps = 12, checkAnswer, signal } = this.options
    const session = this.session
    const turns: ChatTurn[] = toChatTurns(session ? session.messages : [message])
    let progress: AgentProgress = { steps: [], draft: '' }
    const report = (next: Partial<AgentProgress>) => {
      progress = { ...progress, ...next }
      session?.reportProgress(progress)
    }
    let thinking = false
    let lastAnswer: string | null = null

    for (let stepNumber = 1; stepNumber <= maxSteps; stepNumber++) {
      signal?.throwIfAborted()
      const final = stepNumber === maxSteps
      if (final && lastAnswer === null) turns.push({ role: 'user', content: STEP_LIMIT_NOTICE })
      thinking = false
      const step: ModelStep = await this.model.step(turns, this.tools, {
        systemPrompt: this.systemPrompt,
        signal,
        onText: (delta) => report({ draft: progress.draft + delta }),
        onThinking: (delta) => {
          const steps = [...progress.steps]
          const last = steps.at(-1)
          if (thinking && last?.kind === 'thinking') steps[steps.length - 1] = { ...last, text: last.text + delta }
          else steps.push({ kind: 'thinking', text: delta })
          thinking = true
          report({ steps })
        },
      })
      signal?.throwIfAborted()

      if (step.toolCalls.length === 0 || final) {
        if (!step.text.trim()) {
          if (final) break
          throw new Error('The model returned an empty reply.')
        }
        lastAnswer = step.text
        const feedback = final ? null : await checkAnswer?.(step.text)
        if (!feedback) return this.reply(step.text)
        turns.push({ role: 'assistant', content: step.text }, { role: 'user', content: feedback })
        report({ steps: [...progress.steps, { kind: 'check', text: feedback }], draft: '' })
        continue
      }

      turns.push({ role: 'assistant', content: step.text, toolCalls: step.toolCalls, native: step.native })
      const notes: AgentStep[] = step.text.trim() ? [{ kind: 'note', text: step.text.trim() }] : []
      const first = progress.steps.length + notes.length
      report({
        steps: [...progress.steps, ...notes, ...step.toolCalls.map(({ name, args }): AgentStep => ({ kind: 'tool', name, args }))],
        draft: '',
      })
      const results = await Promise.all(
        step.toolCalls.map(async (call, i) => {
          const result = await this.runTool(call)
          const steps = [...progress.steps]
          steps[first + i] = { kind: 'tool', name: call.name, args: call.args, result: result.content, ...(result.isError && { isError: true }) }
          report({ steps })
          return result
        }),
      )
      turns.push({ role: 'tool', results })
    }

    if (lastAnswer !== null) return this.reply(lastAnswer)
    throw new Error(`${this.name} didn't finish its reply within ${maxSteps} steps.`)
  }

  private reply(text: string): Message {
    return new Message({ sender: this.name, contents: [new MessagePart('text', text)] })
  }

  private async runTool({ id, name, args }: ToolCall): Promise<ToolResult> {
    const tool = this.tools.find((t) => t.name === name)
    if (!tool) return { callId: id, name, content: `Unknown tool "${name}".`, isError: true }
    try {
      const output = await tool.call(args)
      return { callId: id, name, content: typeof output === 'string' ? output : JSON.stringify(output) }
    } catch (error) {
      return { callId: id, name, content: error instanceof Error ? error.message : String(error), isError: true }
    }
  }
}
