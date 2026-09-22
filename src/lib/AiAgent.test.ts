import { describe, expect, it, vi } from 'vitest'
import { AgenticTool } from './AgenticTool.ts'
import { AiAgent, type AgentProgress } from './AiAgent.ts'
import { ChatSession } from './ChatSession.ts'
import type { ChatTurn } from './chatTurns.ts'
import { LlmModel, type ModelStep, type StepOptions } from './LlmModel.ts'
import { Message } from './Message.ts'
import { MessagePart } from './MessagePart.ts'

type Script = (turns: ChatTurn[], options: StepOptions) => ModelStep | Promise<ModelStep>

/** A model that plays `script` one step at a time and records what it was sent. */
class ScriptedModel extends LlmModel {
  calls: { turns: ChatTurn[]; tools: string[]; options: StepOptions }[] = []
  private script: Script[]

  constructor(...script: Script[]) {
    super('scripted')
    this.script = script
  }

  async step(turns: ChatTurn[], tools: AgenticTool[], options: StepOptions = {}): Promise<ModelStep> {
    this.calls.push({ turns: structuredClone(turns), tools: tools.map((t) => t.name), options })
    const next = this.script.shift()
    if (!next) throw new Error('script exhausted')
    return next(turns, options)
  }
}

const answer = (text: string): Script => (_turns, { onText }) => {
  onText?.(text)
  return { text, toolCalls: [] }
}

const callTool = (name: string, args: Record<string, unknown>, text = '', id = `call-${name}`): Script =>
  (_turns, { onText }) => {
    if (text) onText?.(text)
    return { text, toolCalls: [{ id, name, args }], native: { raw: id } }
  }

const echoTool = new AgenticTool({
  name: 'echo',
  description: 'Echoes its input',
  parameters: [{ name: 'value', type: 'string', required: true }],
  handler: ({ value }) => `echo: ${String(value)}`,
})

const userMessage = (text: string) => new Message({ sender: 'user', contents: [new MessagePart('text', text)] })

/** Sends `text` to a session with `agent` and resolves with the agent's reply. */
function ask(agent: AiAgent, text = 'hi') {
  const session = new ChatSession()
  const progress: AgentProgress[] = []
  session.on('progress', (p) => progress.push(p))
  const reply = new Promise<Message>((resolve, reject) => {
    session.on('message', (m) => m.sender === agent.name && resolve(m))
    session.on('error', reject)
  })
  session.setAgent(agent)
  session.send(userMessage(text))
  return { reply, progress }
}

describe('AiAgent agentic loop', () => {
  it('runs the tools the model calls and feeds the results back until it answers', async () => {
    const model = new ScriptedModel(callTool('echo', { value: 'x' }, 'Let me check.'), answer('Done: x'))
    const { reply } = ask(new AiAgent('bot', model, [echoTool], 'Be brief.'))

    const message = await reply
    expect(message.contents.map((p) => p.content)).toEqual(['Done: x'])
    expect(model.calls).toHaveLength(2)
    expect(model.calls[1].turns).toEqual([
      { role: 'user', content: 'hi' },
      {
        role: 'assistant',
        content: 'Let me check.',
        toolCalls: [{ id: 'call-echo', name: 'echo', args: { value: 'x' } }],
        native: { raw: 'call-echo' },
      },
      { role: 'tool', results: [{ callId: 'call-echo', name: 'echo', content: 'echo: x' }] },
    ])
    expect(model.calls[0].tools).toEqual(['echo'])
    expect(model.calls[0].options.systemPrompt).toBe('Be brief.')
  })

  it('returns tool failures to the model as error results instead of failing the reply', async () => {
    const throwing = new AgenticTool({
      name: 'boom',
      description: '',
      handler: () => {
        throw new Error('kaput')
      },
    })
    const model = new ScriptedModel(
      () => ({
        text: '',
        toolCalls: [
          { id: '1', name: 'boom', args: {} },
          { id: '2', name: 'echo', args: {} },
          { id: '3', name: 'nope', args: {} },
        ],
      }),
      answer('ok'),
    )
    const { reply } = ask(new AiAgent('bot', model, [echoTool, throwing]))

    await reply
    expect(model.calls[1].turns.at(-1)).toEqual({
      role: 'tool',
      results: [
        { callId: '1', name: 'boom', content: 'kaput', isError: true },
        { callId: '2', name: 'echo', content: 'echo: missing required argument(s) value', isError: true },
        { callId: '3', name: 'nope', content: 'Unknown tool "nope".', isError: true },
      ],
    })
  })

  it('reports its progress: thinking, working notes, tool calls and the streamed answer', async () => {
    const model = new ScriptedModel(
      (turns, options) => {
        options.onThinking?.('Hmm, ')
        options.onThinking?.('check first.')
        return callTool('echo', { value: 'x' }, 'Checking.')(turns, options)
      },
      (_turns, { onText }) => {
        onText?.('Do')
        onText?.('ne')
        return { text: 'Done', toolCalls: [] }
      },
    )
    const { reply, progress } = ask(new AiAgent('bot', model, [echoTool]))

    await reply
    expect(progress.map((p) => p.draft)).toContain('Do')
    expect(progress.at(-1)).toEqual({
      steps: [
        { kind: 'thinking', text: 'Hmm, check first.' },
        { kind: 'note', text: 'Checking.' },
        { kind: 'tool', name: 'echo', args: { value: 'x' }, result: 'echo: x' },
      ],
      draft: 'Done',
    })
    // A tool call shows up before its result is in.
    expect(progress.some((p) => p.steps.some((s) => s.kind === 'tool' && s.result === undefined))).toBe(true)
  })

  it('checks its answer and revises it before the user sees it', async () => {
    const model = new ScriptedModel(answer('broken diagram'), answer('fixed diagram'))
    const checkAnswer = vi.fn((text: string) => (text.includes('broken') ? 'Diagram "A" failed: bad arrow' : null))
    const { reply, progress } = ask(new AiAgent('bot', model, [], '', { checkAnswer }))

    const message = await reply
    expect(message.contents[0].content).toBe('fixed diagram')
    expect(model.calls[1].turns.slice(1)).toEqual([
      { role: 'assistant', content: 'broken diagram' },
      { role: 'user', content: 'Diagram "A" failed: bad arrow' },
    ])
    expect(progress.at(-1)?.steps).toEqual([{ kind: 'check', text: 'Diagram "A" failed: bad arrow' }])
    expect(checkAnswer).toHaveBeenCalledTimes(2)
  })

  it('asks for a final answer without tools once it reaches its step limit', async () => {
    const model = new ScriptedModel(
      callTool('echo', { value: '1' }),
      callTool('echo', { value: '2' }),
      callTool('echo', { value: '3' }, 'Best effort answer.'),
    )
    const { reply } = ask(new AiAgent('bot', model, [echoTool], '', { maxSteps: 3 }))

    const message = await reply
    expect(message.contents[0].content).toBe('Best effort answer.')
    expect(model.calls[2].turns.at(-1)).toMatchObject({ role: 'user', content: expect.stringMatching(/step limit/i) })
  })

  it('fails if the model never answers', async () => {
    const model = new ScriptedModel(callTool('echo', { value: '1' }), callTool('echo', { value: '2' }))
    const { reply } = ask(new AiAgent('bot', model, [echoTool], '', { maxSteps: 2 }))
    await expect(reply).rejects.toThrow(/didn't finish/i)
  })

  it('delivers its last answer if it cannot fix it within the step limit', async () => {
    const model = new ScriptedModel(answer('bad 1'), answer('bad 2'))
    const { reply } = ask(new AiAgent('bot', model, [], '', { maxSteps: 2, checkAnswer: () => 'still broken' }))
    expect((await reply).contents[0].content).toBe('bad 2')
  })

  it('passes its abort signal to the model and stops when aborted', async () => {
    const controller = new AbortController()
    const model = new ScriptedModel((_turns, options) => {
      controller.abort()
      return callTool('echo', { value: 'x' })(_turns, options)
    })
    const { reply } = ask(new AiAgent('bot', model, [echoTool], '', { signal: controller.signal }))

    await expect(reply).rejects.toMatchObject({ name: 'AbortError' })
    expect(model.calls[0].options.signal).toBe(controller.signal)
    expect(model.calls).toHaveLength(1)
  })
})
