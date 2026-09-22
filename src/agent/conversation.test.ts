import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { validateMermaid } from '../components/renderMermaid.ts'
import { db } from '../db.ts'
import { NoProviderError, reply, sendMessage } from './conversation.ts'
import { replyProgress, stopReply } from './replies.ts'
import { AGENT_NAME, SYSTEM_PROMPT } from './systemPrompt.ts'

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

const mermaid = (title: string, body: string) => `\`\`\`mermaid\n---\ntitle: ${title}\n---\n${body}\n\`\`\``

type OllamaMessage = { content?: string; tool_calls?: { function: { name: string; arguments: object } }[] }

const toolCall = (name: string, args: object = {}): OllamaMessage => ({
  content: '',
  tool_calls: [{ function: { name, arguments: args } }],
})

/** Stubs fetch as an Ollama server that answers with `replies` in order (text, or a message). */
function ollamaReplies(...replies: (string | OllamaMessage | Error)[]) {
  const fetch = vi.fn<FetchLike>(async () => {
    const next = replies.shift() ?? 'ok'
    if (next instanceof Error) throw next
    const message = typeof next === 'string' ? { content: next } : next
    return Response.json({ message: { role: 'assistant', ...message }, done: true })
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

function requestBody(fetch: ReturnType<typeof ollamaReplies>, call = 0) {
  const [, init] = fetch.mock.calls[call]
  return JSON.parse(String(init?.body)) as {
    model: string
    messages: { role: string; content: string; tool_name?: string }[]
    tools?: { function: { name: string } }[]
  }
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
    vi.mocked(validateMermaid).mockReset().mockResolvedValue(null)
  })

  it('stores the user message, asks the provider with the GraphiteAI system prompt, and stores the reply', async () => {
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
      { role: 'system', content: SYSTEM_PROMPT },
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

  it('sends attachments and referenced diagrams with the message, and shows them to the model', async () => {
    const { projectId, chatSessionId } = await seed()
    const diagramId = await db.diagrams.add({
      projectId,
      type: 'class',
      name: 'Domain model',
      source: 'classDiagram\n  class Book',
    })
    const fetch = ollamaReplies('Got it.')
    const image = { type: 'attachment' as const, name: 'sketch.png', mediaType: 'image/png', data: 'iVBORw0KGgo=' }
    const notes = { type: 'attachment' as const, name: 'notes.txt', mediaType: 'text/plain', data: btoa('Members borrow books') }

    await sendMessage(chatSessionId, 'Add loans', [image, notes, { type: 'diagram-reference', diagramId }])

    const [userMessage] = await messages(chatSessionId)
    expect(userMessage.parts).toEqual([
      { type: 'text', content: 'Add loans' },
      image,
      notes,
      { type: 'diagram-reference', diagramId },
    ])
    const [, sent] = requestBody(fetch).messages as { role: string; content: string; images?: string[] }[]
    expect(sent.images).toEqual(['iVBORw0KGgo='])
    expect(sent.content).toContain('Attached file "notes.txt":\n```\nMembers borrow books\n```')
    expect(sent.content).toContain('Referenced diagram "Domain model":\n```mermaid\nclassDiagram\n  class Book\n```')
  })

  it('names a new chat after the first attachment when the message has no text', async () => {
    const { chatSessionId } = await seed()
    ollamaReplies('Nice sketch.')

    await sendMessage(chatSessionId, '  ', [
      { type: 'attachment', name: 'whiteboard.jpg', mediaType: 'image/jpeg', data: 'AA==' },
    ])

    expect((await db.chatSessions.get(chatSessionId))?.title).toBe('whiteboard.jpg')
    const [userMessage] = await messages(chatSessionId)
    expect(userMessage.parts.map((p) => p.type)).toEqual(['attachment'])
  })

  it('does nothing when the last message is already answered', async () => {
    const { chatSessionId } = await seed()
    const fetch = ollamaReplies('first')
    await sendMessage(chatSessionId, 'hello')

    await reply(chatSessionId)

    expect(fetch).toHaveBeenCalledOnce()
  })

  it('checks the diagrams in a reply with Mermaid and has the agent fix them before the user sees them', async () => {
    const { chatSessionId } = await seed()
    vi.mocked(validateMermaid).mockImplementation(async (source) =>
      source.includes('-->') ? 'Parse error on line 2: A -->' : null,
    )
    const fetch = ollamaReplies(
      mermaid('Domain model', 'classDiagram\n  A -->'),
      mermaid('Domain model', 'classDiagram\n  A <|-- B'),
    )

    await sendMessage(chatSessionId, 'Model a library')

    const [diagram] = await db.diagrams.toArray()
    expect(diagram.source).toContain('A <|-- B')
    expect(requestBody(fetch, 1).messages.at(-1)).toMatchObject({
      role: 'user',
      content: expect.stringContaining('Parse error on line 2'),
    })
    const [, agentMessage] = await messages(chatSessionId)
    expect(agentMessage.parts).toEqual([{ type: 'diagram-reference', diagramId: diagram.id }])
    expect(agentMessage.steps).toEqual([{ kind: 'check', text: expect.stringContaining('Parse error') }])
  })

  it('lets the agent use its tools before answering, and keeps a record of its work', async () => {
    const { projectId, chatSessionId } = await seed()
    await db.diagrams.add({ projectId, type: 'class', name: 'Domain model', source: 'classDiagram\n  class Book' })
    const fetch = ollamaReplies(toolCall('read_diagram', { title: 'Domain model' }), 'It has a Book class.')

    await sendMessage(chatSessionId, 'What is in the domain model?')

    expect(requestBody(fetch, 0).tools?.map((t) => t.function.name)).toEqual([
      'check_diagram',
      'list_diagrams',
      'read_diagram',
    ])
    expect(requestBody(fetch, 1).messages.at(-1)).toEqual({
      role: 'tool',
      tool_name: 'read_diagram',
      content: 'classDiagram\n  class Book',
    })
    const [, agentMessage] = await messages(chatSessionId)
    expect(agentMessage.parts).toEqual([{ type: 'text', content: 'It has a Book class.' }])
    expect(agentMessage.steps).toEqual([
      {
        kind: 'tool',
        name: 'read_diagram',
        args: { title: 'Domain model' },
        result: 'classDiagram\n  class Book',
      },
    ])
  })

  it('streams its progress while replying', async () => {
    const { chatSessionId } = await seed()
    let push: (line: object) => void = () => {}
    let close: () => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn<FetchLike>(async () => {
        const encoder = new TextEncoder()
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            push = (line) => controller.enqueue(encoder.encode(JSON.stringify(line) + '\n'))
            close = () => controller.close()
          },
        })
        return new Response(body)
      }),
    )

    const sending = sendMessage(chatSessionId, 'hello')
    await vi.waitFor(() => expect(replyProgress(chatSessionId)).toEqual({ steps: [], draft: '' }))
    push({ message: { content: 'Hel' } })
    await vi.waitFor(() => expect(replyProgress(chatSessionId)?.draft).toBe('Hel'))
    push({ message: { content: 'lo!' }, done: true })
    close()
    await sending

    expect(replyProgress(chatSessionId)).toBeUndefined()
    const [, agentMessage] = await messages(chatSessionId)
    expect(agentMessage.parts).toEqual([{ type: 'text', content: 'Hello!' }])
    expect(agentMessage).not.toHaveProperty('steps')
  })

  it('stops a reply on request, saving nothing', async () => {
    const { chatSessionId } = await seed()
    const fetch = vi.fn<FetchLike>(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))),
        ),
    )
    vi.stubGlobal('fetch', fetch)

    const sending = sendMessage(chatSessionId, 'hello')
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
    stopReply(chatSessionId)
    await sending

    expect(replyProgress(chatSessionId)).toBeUndefined()
    expect((await messages(chatSessionId)).map((m) => m.sender)).toEqual(['user'])
  })

  it('does not start a second reply while one is in progress', async () => {
    const { chatSessionId } = await seed()
    let answer: (value: Response) => void = () => {}
    const fetch = vi.fn<FetchLike>(() => new Promise((resolve) => (answer = resolve)))
    vi.stubGlobal('fetch', fetch)

    const sending = sendMessage(chatSessionId, 'hello')
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
    await reply(chatSessionId)
    answer(Response.json({ message: { content: 'hi' }, done: true }))
    await sending

    expect(fetch).toHaveBeenCalledOnce()
    expect(await messages(chatSessionId)).toHaveLength(2)
  })
})
