import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db.ts'
import { NoProviderError, reply, sendMessage } from './conversation.ts'
import { AGENT_NAME, INSTRUCTIONS } from './instructions.ts'

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

const mermaid = (title: string, body: string) => `\`\`\`mermaid\n---\ntitle: ${title}\n---\n${body}\n\`\`\``

/** Stubs fetch as an Ollama server that answers with `replies` in order. */
function ollamaReplies(...replies: (string | Error)[]) {
  const fetch = vi.fn<FetchLike>(async () => {
    const next = replies.shift() ?? 'ok'
    if (next instanceof Error) throw next
    return Response.json({ message: { role: 'assistant', content: next } })
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

function requestBody(fetch: ReturnType<typeof ollamaReplies>, call = 0) {
  const [, init] = fetch.mock.calls[call]
  return JSON.parse(String(init?.body)) as { model: string; messages: { role: string; content: string }[] }
}

async function seed() {
  const projectId = await db.projects.add({ name: 'Library', createdAt: new Date() })
  const chatSessionId = await db.chatSessions.add({ projectId, title: 'New chat', draft: '' })
  const providerId = await db.providers.add({
    kind: 'ollama',
    name: 'Local',
    args: { baseUrl: 'http://ollama.test', model: 'llama3.2' },
  })
  return { projectId, chatSessionId, providerId }
}

const messages = (chatSessionId: number) => db.messages.where({ chatSessionId }).sortBy('on')

describe('conversation', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('stores the user message, asks the provider with the GraphiteAI instructions, and stores the reply', async () => {
    const { chatSessionId } = await seed()
    const fetch = ollamaReplies('Sure, which classes?')

    await sendMessage(chatSessionId, 'Model a library')

    const stored = await messages(chatSessionId)
    expect(stored.map((m) => [m.sender, m.parts])).toEqual([
      ['user', [{ type: 'text', content: 'Model a library' }]],
      [AGENT_NAME, [{ type: 'text', content: 'Sure, which classes?' }]],
    ])
    expect(fetch.mock.calls[0][0]).toBe('http://ollama.test/api/chat')
    expect(requestBody(fetch).messages).toEqual([
      { role: 'system', content: INSTRUCTIONS },
      { role: 'user', content: 'Model a library' },
    ])
    expect((await db.chatSessions.get(chatSessionId))?.title).toBe('Model a library')
  })

  it('saves mermaid blocks in the reply as project diagrams and references them', async () => {
    const { projectId, chatSessionId } = await seed()
    ollamaReplies(`Here it is:\n\n${mermaid('Domain model', 'classDiagram\n  class Book')}\n\nAnything else?`)

    await sendMessage(chatSessionId, 'Model a library')

    const [diagram] = await db.diagrams.toArray()
    expect(diagram).toMatchObject({ projectId, name: 'Domain model', type: 'class' })
    expect(diagram.source).toContain('class Book')
    const [, agentMessage] = await messages(chatSessionId)
    expect(agentMessage.parts).toEqual([
      { type: 'text', content: 'Here it is:' },
      { type: 'diagram-reference', diagramId: diagram.id },
      { type: 'text', content: 'Anything else?' },
    ])
  })

  it('updates a diagram with the same title instead of duplicating it, and shows the model its source', async () => {
    const { chatSessionId } = await seed()
    const fetch = ollamaReplies(
      mermaid('Domain model', 'classDiagram\n  class Book'),
      mermaid('domain model', 'classDiagram\n  class Book\n  class Loan'),
    )

    await sendMessage(chatSessionId, 'Model a library')
    await sendMessage(chatSessionId, 'Add loans')

    const diagrams = await db.diagrams.toArray()
    expect(diagrams).toHaveLength(1)
    expect(diagrams[0].source).toContain('class Loan')
    expect(requestBody(fetch, 1).messages[2]).toEqual({
      role: 'assistant',
      content: '```mermaid\n---\ntitle: Domain model\n---\nclassDiagram\n  class Book\n```',
    })
  })

  it('keeps other code blocks as code parts', async () => {
    const { chatSessionId } = await seed()
    ollamaReplies('```json\n{"a": 1}\n```')

    await sendMessage(chatSessionId, 'json please')

    const [, agentMessage] = await messages(chatSessionId)
    expect(agentMessage.parts).toEqual([{ type: 'code', content: '{"a": 1}', language: 'json' }])
  })

  it('uses the chat’s chosen provider, falling back to the first one', async () => {
    const { chatSessionId } = await seed()
    const otherId = await db.providers.add({
      kind: 'openai-compatible',
      name: 'LM Studio',
      args: { baseUrl: 'http://lmstudio.test/v1', model: 'qwen' },
    })
    const fetch = vi.fn<FetchLike>(async () => Response.json({ choices: [{ message: { content: 'hi' } }] }))
    vi.stubGlobal('fetch', fetch)
    await db.chatSessions.update(chatSessionId, { providerId: otherId })

    await sendMessage(chatSessionId, 'hello')

    expect(fetch.mock.calls[0][0]).toBe('http://lmstudio.test/v1/chat/completions')
  })

  it('throws NoProviderError when no provider is configured, keeping the user message', async () => {
    const { chatSessionId, providerId } = await seed()
    await db.providers.delete(providerId)

    await expect(sendMessage(chatSessionId, 'hello')).rejects.toBeInstanceOf(NoProviderError)
    expect(await messages(chatSessionId)).toHaveLength(1)
  })

  it('surfaces provider failures and can retry without resending the user message', async () => {
    const { chatSessionId } = await seed()
    ollamaReplies(new TypeError('Failed to fetch'), 'Back online')

    await expect(sendMessage(chatSessionId, 'hello')).rejects.toThrow('Failed to fetch')
    await reply(chatSessionId)

    const stored = await messages(chatSessionId)
    expect(stored.map((m) => m.sender)).toEqual(['user', AGENT_NAME])
  })

  it('drops the reply if the chat was deleted while waiting for it', async () => {
    const { chatSessionId } = await seed()
    let answer: (value: Response) => void = () => {}
    const fetch = vi.fn<FetchLike>(() => new Promise((resolve) => (answer = resolve)))
    vi.stubGlobal('fetch', fetch)

    const sending = sendMessage(chatSessionId, 'hello')
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
    await db.messages.where({ chatSessionId }).delete()
    await db.chatSessions.delete(chatSessionId)
    answer(Response.json({ message: { content: mermaid('Orphan', 'classDiagram') } }))
    await sending

    expect(await db.messages.count()).toBe(0)
    expect(await db.diagrams.count()).toBe(0)
  })

  it('does nothing when the last message is already answered', async () => {
    const { chatSessionId } = await seed()
    const fetch = ollamaReplies('first')
    await sendMessage(chatSessionId, 'hello')

    await reply(chatSessionId)

    expect(fetch).toHaveBeenCalledOnce()
  })
})
