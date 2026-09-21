import { describe, expect, it, vi } from 'vitest'
import { AnthropicProvider } from './AnthropicProvider.ts'
import { Message } from './Message.ts'
import { MessagePart } from './MessagePart.ts'
import { OllamaProvider } from './OllamaProvider.ts'
import { OpenAiCompatibleProvider } from './OpenAiCompatibleProvider.ts'

type Call = { url: string; method: string; headers: Headers; body: unknown }

/** A fetch stub that answers with `responses` in order and records every request. */
function fakeFetch(...responses: unknown[]) {
  const calls: Call[] = []
  const fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const request = new Request(input, init)
    const text = await request.text()
    calls.push({
      url: request.url,
      method: request.method,
      headers: request.headers,
      body: text ? JSON.parse(text) : undefined,
    })
    const next = responses.shift()
    const status = next instanceof HttpError ? next.status : 200
    return new Response(JSON.stringify(next instanceof HttpError ? next.body : next), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  })
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls }
}

class HttpError {
  status: number
  body: unknown
  constructor(status: number, body: unknown) {
    this.status = status
    this.body = body
  }
}

const history = [
  new Message({ sender: 'user', contents: [new MessagePart('text', 'Draw a class')] }),
  new Message({ sender: 'GraphiteAI', contents: [new MessagePart('text', 'Which class?')] }),
  new Message({ sender: 'user', contents: [new MessagePart('text', 'Book')] }),
]

const turns = [
  { role: 'user', content: 'Draw a class' },
  { role: 'assistant', content: 'Which class?' },
  { role: 'user', content: 'Book' },
]

const anthropicReply = (overrides: Record<string, unknown> = {}) => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5',
  content: [{ type: 'text', text: 'classDiagram\n  class Book' }],
  stop_reason: 'end_turn',
  stop_details: null,
  usage: { input_tokens: 1, output_tokens: 1 },
  ...overrides,
})

describe('provider parameters', () => {
  it.each([
    [new AnthropicProvider(), ['apiKey', 'model']],
    [new OllamaProvider(), ['baseUrl', 'model']],
    [new OpenAiCompatibleProvider(), ['baseUrl', 'apiKey', 'model']],
  ])('%s exposes its settings', (provider, names) => {
    expect(provider.exposeParameters().map((p) => p.name)).toEqual(names)
  })

  it('marks API keys as secret and defaults the Anthropic model to claude-opus-5', () => {
    const params = new AnthropicProvider().exposeParameters()
    expect(params.find((p) => p.name === 'apiKey')).toMatchObject({ secret: true, required: true })
    expect(params.find((p) => p.name === 'model')?.default).toBe('claude-opus-5')
  })

  it('refuses to provide a model when a required argument is missing or blank', () => {
    expect(() => new OllamaProvider().provideModel({ model: '' })).toThrow(/model/)
    expect(() => new AnthropicProvider().provideModel({})).toThrow(/apiKey/)
  })

  it('fills in defaults for arguments that were left out', async () => {
    const { fetch, calls } = fakeFetch({ models: [] })
    await new OllamaProvider({ fetch }).listModels({})
    expect(calls[0].url).toBe('http://localhost:11434/api/tags')
  })
})

describe('AnthropicProvider', () => {
  it('lists models with the API key and browser-access header', async () => {
    const { fetch, calls } = fakeFetch({
      data: [{ id: 'claude-opus-5', type: 'model', display_name: 'Claude Opus 5', created_at: '' }],
      has_more: false,
      first_id: 'claude-opus-5',
      last_id: 'claude-opus-5',
    })
    const models = await new AnthropicProvider({ fetch }).listModels({ apiKey: 'sk-test' })

    expect(models).toEqual(['claude-opus-5'])
    expect(calls[0].url).toMatch(/\/v1\/models/)
    expect(calls[0].headers.get('x-api-key')).toBe('sk-test')
    expect(calls[0].headers.get('anthropic-dangerous-direct-browser-access')).toBe('true')
  })

  it('completes a conversation and opts Opus 5 into server-side fallbacks', async () => {
    const { fetch, calls } = fakeFetch(anthropicReply())
    const model = new AnthropicProvider({ fetch }).provideModel({ apiKey: 'sk-test', model: 'claude-opus-5' })
    const parts = await model.complete(history, [])

    expect(parts.map((p) => [p.type, p.content])).toEqual([['text', 'classDiagram\n  class Book']])
    expect(calls[0].url).toMatch(/\/v1\/messages/)
    expect(calls[0].headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01')
    expect(calls[0].body).toMatchObject({ model: 'claude-opus-5', messages: turns, fallbacks: 'default' })
  })

  it('sends the instructions as the system prompt', async () => {
    const { fetch, calls } = fakeFetch(anthropicReply())
    await new AnthropicProvider({ fetch })
      .provideModel({ apiKey: 'sk-test' })
      .complete(history, [], 'Only draw UML.')
    expect(calls[0].body).toMatchObject({ system: 'Only draw UML.' })
  })

  it('does not send fallbacks for models that do not support them', async () => {
    const { fetch, calls } = fakeFetch(anthropicReply({ model: 'claude-haiku-4-5' }))
    await new AnthropicProvider({ fetch })
      .provideModel({ apiKey: 'sk-test', model: 'claude-haiku-4-5' })
      .complete(history, [])

    expect(calls[0].body).not.toHaveProperty('fallbacks')
    expect(calls[0].headers.get('anthropic-beta')).toBeNull()
  })

  it('reports a refusal as an error', async () => {
    const { fetch } = fakeFetch(
      anthropicReply({
        content: [],
        stop_reason: 'refusal',
        stop_details: { type: 'refusal', category: null, explanation: 'Declined.' },
      }),
    )
    const model = new AnthropicProvider({ fetch }).provideModel({ apiKey: 'sk-test' })
    await expect(model.complete(history, [])).rejects.toThrow(/declined/i)
  })
})

describe('OllamaProvider', () => {
  it('lists local models', async () => {
    const { fetch, calls } = fakeFetch({ models: [{ name: 'llama3.2:latest' }, { name: 'qwen3:8b' }] })
    const models = await new OllamaProvider({ fetch }).listModels({ baseUrl: 'http://gpu-box:11434/' })

    expect(models).toEqual(['llama3.2:latest', 'qwen3:8b'])
    expect(calls[0].url).toBe('http://gpu-box:11434/api/tags')
  })

  it('completes a conversation through /api/chat without streaming', async () => {
    const { fetch, calls } = fakeFetch({ message: { role: 'assistant', content: 'classDiagram' } })
    const parts = await new OllamaProvider({ fetch })
      .provideModel({ model: 'llama3.2' })
      .complete(history, [])

    expect(parts[0].content).toBe('classDiagram')
    expect(calls[0]).toMatchObject({
      url: 'http://localhost:11434/api/chat',
      method: 'POST',
      body: { model: 'llama3.2', messages: turns, stream: false },
    })
  })

  it('sends the instructions as a leading system message', async () => {
    const { fetch, calls } = fakeFetch({ message: { role: 'assistant', content: 'ok' } })
    await new OllamaProvider({ fetch }).provideModel({ model: 'llama3.2' }).complete(history, [], 'Only draw UML.')
    expect(calls[0].body).toMatchObject({ messages: [{ role: 'system', content: 'Only draw UML.' }, ...turns] })
  })

  it('surfaces HTTP errors with the server message', async () => {
    const { fetch } = fakeFetch(new HttpError(404, { error: 'model "nope" not found' }))
    const model = new OllamaProvider({ fetch }).provideModel({ model: 'nope' })
    await expect(model.complete(history, [])).rejects.toThrow(/404.*not found/)
  })
})

describe('OpenAiCompatibleProvider', () => {
  it('lists models with a bearer token', async () => {
    const { fetch, calls } = fakeFetch({ data: [{ id: 'gpt-5' }, { id: 'gpt-5-mini' }] })
    const models = await new OpenAiCompatibleProvider({ fetch }).listModels({ apiKey: 'sk-oa' })

    expect(models).toEqual(['gpt-5', 'gpt-5-mini'])
    expect(calls[0].url).toBe('https://api.openai.com/v1/models')
    expect(calls[0].headers.get('authorization')).toBe('Bearer sk-oa')
  })

  it('omits the authorization header when no key is set (local servers)', async () => {
    const { fetch, calls } = fakeFetch({ data: [] })
    await new OpenAiCompatibleProvider({ fetch }).listModels({ baseUrl: 'http://localhost:1234/v1' })
    expect(calls[0].headers.get('authorization')).toBeNull()
  })

  it('completes a conversation through /chat/completions', async () => {
    const { fetch, calls } = fakeFetch({ choices: [{ message: { role: 'assistant', content: 'ok' } }] })
    const parts = await new OpenAiCompatibleProvider({ fetch })
      .provideModel({ apiKey: 'sk-oa', model: 'gpt-5' })
      .complete(history, [])

    expect(parts[0].content).toBe('ok')
    expect(calls[0]).toMatchObject({
      url: 'https://api.openai.com/v1/chat/completions',
      body: { model: 'gpt-5', messages: turns },
    })
  })

  it('sends the instructions as a leading system message', async () => {
    const { fetch, calls } = fakeFetch({ choices: [{ message: { role: 'assistant', content: 'ok' } }] })
    await new OpenAiCompatibleProvider({ fetch })
      .provideModel({ model: 'gpt-5' })
      .complete(history, [], 'Only draw UML.')
    expect(calls[0].body).toMatchObject({ messages: [{ role: 'system', content: 'Only draw UML.' }, ...turns] })
  })
})
