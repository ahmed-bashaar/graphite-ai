import { describe, expect, it, vi } from 'vitest'
import type { AgenticTool } from './AgenticTool.ts'
import { AiAgent } from './AiAgent.ts'
import { ChatSession } from './ChatSession.ts'
import type { ChatTurn } from './chatTurns.ts'
import { LlmModel, type ModelStep } from './LlmModel.ts'
import { Message } from './Message.ts'
import { MessagePart } from './MessagePart.ts'

class EchoModel extends LlmModel {
  step = vi.fn(async (turns: ChatTurn[], tools: AgenticTool[]): Promise<ModelStep> => {
    const last = turns[turns.length - 1]
    const content = 'content' in last ? last.content : ''
    return { text: `echo ${content} (${turns.length} msgs, ${tools.length} tools)`, toolCalls: [] }
  })
}

class FailingModel extends LlmModel {
  async step(): Promise<ModelStep> {
    throw new Error('model down')
  }
}

const userMessage = (text: string) => new Message({ sender: 'user', contents: [new MessagePart('text', text)] })

/** Resolves once `session` has emitted `count` messages in total. */
const waitForMessages = (session: ChatSession, count: number) =>
  vi.waitFor(() => expect(session.messages).toHaveLength(count))

describe('ChatSession', () => {
  it('sends the draft: marks it sent, stamps it, stores it, clears the draft', () => {
    const session = new ChatSession()
    const onMessage = vi.fn()
    const onDraft = vi.fn()
    session.on('message', onMessage)
    session.on('draft', onDraft)
    const draft = new Message({ sender: 'user', on: new Date(0) })

    session.setDraft(draft)
    session.send()

    expect(draft.isSent).toBe(true)
    expect(draft.on.getTime()).toBeGreaterThan(0)
    expect(session.messages).toEqual([draft])
    expect(session.draft).toBeNull()
    expect(onMessage).toHaveBeenCalledExactlyOnceWith(draft)
    expect(onDraft.mock.calls).toEqual([[draft], [null]])
  })

  it('does nothing when sending with no draft', () => {
    const session = new ChatSession()
    const onMessage = vi.fn()
    session.on('message', onMessage)

    session.send()

    expect(session.messages).toEqual([])
    expect(onMessage).not.toHaveBeenCalled()
  })

  it('keeps the draft when an explicit message is sent', () => {
    const session = new ChatSession()
    const draft = userMessage('draft')
    session.setDraft(draft)

    session.send(userMessage('other'))

    expect(session.draft).toBe(draft)
    expect(session.messages).toHaveLength(1)
  })
})

describe('AiAgent in a ChatSession', () => {
  it('replies to user messages through the session, with the full history', async () => {
    const model = new EchoModel('echo')
    const session = new ChatSession(new AiAgent('bot', model))

    session.send(userMessage('hi'))
    await waitForMessages(session, 2)
    session.send(userMessage('again'))
    await waitForMessages(session, 4)

    expect(session.messages.map((m) => m.sender)).toEqual(['user', 'bot', 'user', 'bot'])
    expect(session.messages[3].contents[0].content).toBe('echo again (3 msgs, 0 tools)')
    expect(session.messages[3].isSent).toBe(true)
  })

  it('does not reply to its own messages', async () => {
    const model = new EchoModel('echo')
    const session = new ChatSession(new AiAgent('bot', model))

    session.send(userMessage('hi'))
    await waitForMessages(session, 2)
    // Give a (wrong) reply-to-self a chance to happen.
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(model.step).toHaveBeenCalledTimes(1)
    expect(session.messages).toHaveLength(2)
  })

  it('passes its tools to the model', async () => {
    const model = new EchoModel('echo')
    const tool = { name: 't' } as AgenticTool
    const session = new ChatSession(new AiAgent('bot', model, [tool]))

    session.send(userMessage('hi'))
    await waitForMessages(session, 2)

    expect(model.step).toHaveBeenCalledWith(expect.any(Array), [tool], expect.anything())
  })

  it('passes its system prompt to the model', async () => {
    const model = new EchoModel('echo')
    const agent = new AiAgent('bot', model, [], 'Only draw UML.')
    expect(agent.systemPrompt).toBe('Only draw UML.')
    const session = new ChatSession(agent)

    session.send(userMessage('hi'))
    await waitForMessages(session, 2)

    expect(model.step).toHaveBeenCalledWith(
      expect.any(Array),
      [],
      expect.objectContaining({ systemPrompt: 'Only draw UML.' }),
    )
  })

  it('reports model failures as an error event', async () => {
    const session = new ChatSession(new AiAgent('bot', new FailingModel('broken')))
    const onError = vi.fn()
    session.on('error', onError)

    session.send(userMessage('hi'))

    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce())
    expect((onError.mock.calls[0][0] as Error).message).toBe('model down')
    expect(session.messages).toHaveLength(1)
  })

  it('stops replying once the agent is removed', async () => {
    const model = new EchoModel('echo')
    const session = new ChatSession(new AiAgent('bot', model))

    session.setAgent(null)
    session.send(userMessage('hi'))
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(model.step).not.toHaveBeenCalled()
  })

  it('moving an agent to another session detaches it from the first', async () => {
    const model = new EchoModel('echo')
    const agent = new AiAgent('bot', model)
    const first = new ChatSession(agent)
    const second = new ChatSession()

    second.setAgent(agent)
    first.send(userMessage('ignored'))
    second.send(userMessage('answered'))
    await waitForMessages(second, 2)

    expect(first.messages).toHaveLength(1)
    expect(model.step).toHaveBeenCalledOnce()
  })
})
