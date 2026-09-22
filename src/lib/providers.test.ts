import { describe, expect, it, vi } from 'vitest'
import { AgenticTool } from './AgenticTool.ts'
import { AnthropicProvider } from './AnthropicProvider.ts'
import type { ChatTurn } from './chatTurns.ts'
import { OllamaProvider } from './OllamaProvider.ts'
import { OpenAiCompatibleProvider } from './OpenAiCompatibleProvider.ts'

type Call = { url: string; method: string; headers: Headers; body: unknown }

/**
 * A fetch stub that answers with `responses` in order and records every
 * request. Plain values are sent as JSON; Responses are returned as they are.
 */
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
    if (next instanceof Response) return next
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

const turns: ChatTurn[] = [
  { role: 'user', content: 'Draw a class' },
  { role: 'assistant', content: 'Which class?' },
  { role: 'user', content: 'Book' },
]

const checkTool = new AgenticTool({
  name: 'check_diagram',
  description: 'Checks Mermaid source',
  parameters: [{ name: 'source', type: 'string', required: true }],
  handler: () => 'ok',
})

/** A transcript where the model called `check_diagram` and got its result. */
const toolTurns = (native?: unknown): ChatTurn[] => [
  { role: 'user', content: 'Draw a class' },
  {
    role: 'assistant',
    content: 'Checking.',
    toolCalls: [{ id: 'call_1', name: 'check_diagram', args: { source: 'classDiagram' } }],
    ...(native !== undefined && { native }),
  },
  { role: 'tool', results: [{ callId: 'call_1', name: 'check_diagram', content: 'Valid.' }] },
]

/** Records every streamed text and thinking delta. */
function recorder() {
  const text: string[] = []
  const thinking: string[] = []
  return {
    text,
    thinking,
    options: { onText: (d: string) => text.push(d), onThinking: (d: string) => thinking.push(d) },
  }
}

const png = { name: 'sketch.png', mediaType: 'image/png', data: 'iVBORw0KGgo=' }
const pdf = { name: 'spec.pdf', mediaType: 'application/pdf', data: 'JVBERi0=' }

/** A user turn with an image and a PDF attached. */
const attachmentTurns: ChatTurn[] = [{ role: 'user', content: 'Model this', attachments: [png, pdf] }]

const streamResponse = (body: string, contentType: string) =>
  new Response(body, { status: 200, headers: { 'content-type': contentType } })

type Block =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string; signature: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'fallback'; from: { model: string }; to: { model: string } }

/** An Anthropic Messages SSE stream that produces `content`, split into deltas. */
function anthropicStream(content: Block[], stopReason = 'end_turn', stopDetails: unknown = null) {
  const events: [string, unknown][] = [
    [
      'message_start',
      {
        type: 'message_start',
        message: {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-opus-5',
          content: [],
          stop_reason: null,
          stop_details: null,
          usage: { input_tokens: 1, output_tokens: 0 },
        },
      },
    ],
  ]
  content.forEach((block, index) => {
    const start = (contentBlock: unknown) =>
      events.push(['content_block_start', { type: 'content_block_start', index, content_block: contentBlock }])
    const delta = (d: unknown) => events.push(['content_block_delta', { type: 'content_block_delta', index, delta: d }])
    if (block.type === 'text') {
      start({ type: 'text', text: '' })
      for (const piece of block.text.match(/.{1,4}/gs) ?? []) delta({ type: 'text_delta', text: piece })
    } else if (block.type === 'thinking') {
      start({ type: 'thinking', thinking: '', signature: '' })
      delta({ type: 'thinking_delta', thinking: block.thinking })
      delta({ type: 'signature_delta', signature: block.signature })
    } else if (block.type === 'tool_use') {
      start({ ...block, input: {} })
      delta({ type: 'input_json_delta', partial_json: JSON.stringify(block.input) })
    } else {
      start(block)
    }
    events.push(['content_block_stop', { type: 'content_block_stop', index }])
  })
  events.push(
    [
      'message_delta',
      {
        type: 'message_delta',
        delta: { stop_reason: stopReason, stop_details: stopDetails },
        usage: { output_tokens: 1 },
      },
    ],
    ['message_stop', { type: 'message_stop' }],
  )
  const body = events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('')
  return streamResponse(body, 'text/event-stream')
}

const ndjson = (...lines: unknown[]) =>
  streamResponse(lines.map((line) => JSON.stringify(line)).join('\n') + '\n', 'application/x-ndjson')

const sse = (...events: unknown[]) =>
  streamResponse(
    events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n',
    'text/event-stream',
  )

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
  const opus = (fetch: typeof globalThis.fetch) =>
    new AnthropicProvider({ fetch }).provideModel({ apiKey: 'sk-test', model: 'claude-opus-5' })

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

  it('streams a reply, with summarized adaptive thinking and server-side fallbacks for Opus 5', async () => {
    const { fetch, calls } = fakeFetch(
      anthropicStream([
        { type: 'thinking', thinking: 'A Book class.', signature: 'sig' },
        { type: 'text', text: 'classDiagram\n  class Book' },
      ]),
    )
    const streamed = recorder()
    const step = await opus(fetch).step(turns, [], { systemPrompt: 'Only draw UML.', ...streamed.options })

    expect(step).toMatchObject({ text: 'classDiagram\n  class Book', toolCalls: [] })
    expect(streamed.text.length).toBeGreaterThan(1)
    expect(streamed.text.join('')).toBe('classDiagram\n  class Book')
    expect(streamed.thinking).toEqual(['A Book class.'])
    expect(calls[0].url).toMatch(/\/v1\/messages/)
    expect(calls[0].headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01')
    expect(calls[0].body).toMatchObject({
      model: 'claude-opus-5',
      stream: true,
      system: 'Only draw UML.',
      messages: turns,
      thinking: { type: 'adaptive', display: 'summarized' },
      fallbacks: 'default',
    })
    expect(calls[0].body).not.toHaveProperty('tools')
  })

  it('turns on prompt caching, so the loop resends history and attachments as cache reads', async () => {
    const { fetch, calls } = fakeFetch(anthropicStream([{ type: 'text', text: 'ok' }]))
    await opus(fetch).step(attachmentTurns, [checkTool])
    expect(calls[0].body).toMatchObject({ cache_control: { type: 'ephemeral' } })
  })

  it('does not send fallbacks or adaptive thinking to models that do not support them', async () => {
    const { fetch, calls } = fakeFetch(anthropicStream([{ type: 'text', text: 'ok' }]))
    await new AnthropicProvider({ fetch })
      .provideModel({ apiKey: 'sk-test', model: 'claude-haiku-4-5' })
      .step(turns, [])

    expect(calls[0].body).not.toHaveProperty('fallbacks')
    expect(calls[0].body).not.toHaveProperty('thinking')
    expect(calls[0].headers.get('anthropic-beta')).toBeNull()
  })

  it('offers tools and returns the calls the model makes, keeping its content blocks for replay', async () => {
    const content: Block[] = [
      { type: 'thinking', thinking: 'Validate first.', signature: 'sig' },
      { type: 'text', text: 'Checking.' },
      { type: 'tool_use', id: 'toolu_1', name: 'check_diagram', input: { source: 'classDiagram' } },
    ]
    const { fetch, calls } = fakeFetch(anthropicStream(content, 'tool_use'))
    const step = await opus(fetch).step(turns, [checkTool])

    expect(calls[0].body).toMatchObject({
      tools: [
        {
          name: 'check_diagram',
          description: 'Checks Mermaid source',
          input_schema: { type: 'object', properties: { source: { type: 'string' } }, required: ['source'] },
        },
      ],
    })
    expect(step.text).toBe('Checking.')
    expect(step.toolCalls).toEqual([{ id: 'toolu_1', name: 'check_diagram', args: { source: 'classDiagram' } }])
    expect(step.native).toEqual(content)
  })

  it('replays assistant turns as their original content blocks and tool results as tool_result blocks', async () => {
    const native = [
      { type: 'thinking', thinking: 'Validate first.', signature: 'sig' },
      { type: 'tool_use', id: 'call_1', name: 'check_diagram', input: { source: 'classDiagram' } },
    ]
    const { fetch, calls } = fakeFetch(anthropicStream([{ type: 'text', text: 'Done.' }]))
    await opus(fetch).step(toolTurns(native), [checkTool])

    expect((calls[0].body as { messages: unknown }).messages).toEqual([
      { role: 'user', content: 'Draw a class' },
      { role: 'assistant', content: native },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_1', content: 'Valid.' }] },
    ])
  })

  it('builds tool_use blocks for tool calls that have no native record', async () => {
    const { fetch, calls } = fakeFetch(anthropicStream([{ type: 'text', text: 'Done.' }]))
    await opus(fetch).step(toolTurns(), [checkTool])

    expect((calls[0].body as { messages: unknown[] }).messages[1]).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: 'Checking.' },
        { type: 'tool_use', id: 'call_1', name: 'check_diagram', input: { source: 'classDiagram' } },
      ],
    })
  })

  it('drops thinking and tool calls from before a mid-output fallback', async () => {
    const { fetch } = fakeFetch(
      anthropicStream(
        [
          { type: 'thinking', thinking: 'Declined part.', signature: 'sig1' },
          { type: 'text', text: 'Partial ' },
          { type: 'tool_use', id: 'toolu_old', name: 'check_diagram', input: { source: 'x' } },
          { type: 'fallback', from: { model: 'claude-opus-5' }, to: { model: 'claude-opus-4-8' } },
          { type: 'text', text: 'answer.' },
          { type: 'tool_use', id: 'toolu_new', name: 'check_diagram', input: { source: 'y' } },
        ],
        'tool_use',
      ),
    )
    const step = await opus(fetch).step(turns, [checkTool])

    expect(step.text).toBe('Partial answer.')
    expect(step.toolCalls.map((c) => c.id)).toEqual(['toolu_new'])
    expect((step.native as { type: string }[]).map((b) => b.type)).toEqual(['text', 'fallback', 'text', 'tool_use'])
  })

  it('reports a refusal as an error', async () => {
    const { fetch } = fakeFetch(
      anthropicStream([], 'refusal', { type: 'refusal', category: null, explanation: 'Declined.' }),
    )
    await expect(opus(fetch).step(turns, [])).rejects.toThrow(/declined/i)
  })

  it('sends attached images and PDFs as image and document blocks before the text', async () => {
    const { fetch, calls } = fakeFetch(anthropicStream([{ type: 'text', text: 'ok' }]))
    await opus(fetch).step(
      [...attachmentTurns, { role: 'assistant', content: 'Done' }, { role: 'user', content: '', attachments: [png] }],
      [],
    )

    expect((calls[0].body as { messages: unknown }).messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: png.data } },
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.data }, title: 'spec.pdf' },
          { type: 'text', text: 'Model this' },
        ],
      },
      { role: 'assistant', content: 'Done' },
      { role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: png.data } }] },
    ])
  })

  it('refuses to run tool calls cut off by the token limit', async () => {
    const { fetch } = fakeFetch(
      anthropicStream([{ type: 'tool_use', id: 't', name: 'check_diagram', input: { source: 'x' } }], 'max_tokens'),
    )
    await expect(opus(fetch).step(turns, [checkTool])).rejects.toThrow(/token limit/i)
  })
})

describe('OllamaProvider', () => {
  const llama = (fetch: typeof globalThis.fetch) => new OllamaProvider({ fetch }).provideModel({ model: 'llama3.2' })

  it('lists local models', async () => {
    const { fetch, calls } = fakeFetch({ models: [{ name: 'llama3.2:latest' }, { name: 'qwen3:8b' }] })
    const models = await new OllamaProvider({ fetch }).listModels({ baseUrl: 'http://gpu-box:11434/' })

    expect(models).toEqual(['llama3.2:latest', 'qwen3:8b'])
    expect(calls[0].url).toBe('http://gpu-box:11434/api/tags')
  })

  it('streams a reply from /api/chat, with the system prompt as a leading message', async () => {
    const { fetch, calls } = fakeFetch(
      ndjson(
        { message: { role: 'assistant', content: 'class' }, done: false },
        { message: { role: 'assistant', content: 'Diagram' }, done: false },
        { message: { role: 'assistant', content: '' }, done: true },
      ),
    )
    const streamed = recorder()
    const step = await llama(fetch).step(turns, [], { systemPrompt: 'Only draw UML.', ...streamed.options })

    expect(step).toEqual({ text: 'classDiagram', toolCalls: [] })
    expect(streamed.text).toEqual(['class', 'Diagram'])
    expect(calls[0]).toMatchObject({
      url: 'http://localhost:11434/api/chat',
      method: 'POST',
      body: { model: 'llama3.2', messages: [{ role: 'system', content: 'Only draw UML.' }, ...turns], stream: true },
    })
    expect(calls[0].body).not.toHaveProperty('tools')
  })

  it('offers tools, returns tool calls and streams thinking', async () => {
    const { fetch, calls } = fakeFetch(
      ndjson(
        { message: { role: 'assistant', content: '', thinking: 'Check it.' }, done: false },
        {
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [{ function: { name: 'check_diagram', arguments: { source: 'classDiagram' } } }],
          },
          done: true,
        },
      ),
    )
    const streamed = recorder()
    const step = await llama(fetch).step(turns, [checkTool], streamed.options)

    expect(calls[0].body).toMatchObject({
      tools: [
        {
          type: 'function',
          function: { name: 'check_diagram', description: 'Checks Mermaid source', parameters: checkTool.inputSchema() },
        },
      ],
    })
    expect(streamed.thinking).toEqual(['Check it.'])
    expect(step.toolCalls).toEqual([{ id: expect.any(String), name: 'check_diagram', args: { source: 'classDiagram' } }])
  })

  it('replays tool calls and their results in Ollama’s format', async () => {
    const { fetch, calls } = fakeFetch(ndjson({ message: { content: 'Done.' }, done: true }))
    await llama(fetch).step(toolTurns(), [checkTool])

    expect((calls[0].body as { messages: unknown }).messages).toEqual([
      { role: 'user', content: 'Draw a class' },
      {
        role: 'assistant',
        content: 'Checking.',
        tool_calls: [{ function: { name: 'check_diagram', arguments: { source: 'classDiagram' } } }],
      },
      { role: 'tool', tool_name: 'check_diagram', content: 'Valid.' },
    ])
  })

  it('falls back to no tools for models that do not support them', async () => {
    const { fetch, calls } = fakeFetch(
      new HttpError(400, { error: 'registry.ollama.ai/library/gemma:2b does not support tools' }),
      ndjson({ message: { content: 'ok' }, done: true }),
    )

    expect((await llama(fetch).step(turns, [checkTool])).text).toBe('ok')
    expect(calls[1].body).not.toHaveProperty('tools')
  })

  it('remembers across replies that a model does not support tools', async () => {
    const { fetch, calls } = fakeFetch(
      new HttpError(400, { error: 'registry.ollama.ai/library/gemma:2b does not support tools' }),
      ndjson({ message: { content: 'ok' }, done: true }),
      ndjson({ message: { content: 'ok' }, done: true }),
    )
    const provider = new OllamaProvider({ fetch })
    await provider.provideModel({ model: 'gemma:2b' }).step(turns, [checkTool])
    await provider.provideModel({ model: 'gemma:2b' }).step(turns, [checkTool])

    expect(calls).toHaveLength(3)
    expect(calls[2].body).not.toHaveProperty('tools')
  })

  it('surfaces HTTP errors with the server message', async () => {
    const { fetch } = fakeFetch(new HttpError(404, { error: 'model "nope" not found' }))
    const model = new OllamaProvider({ fetch }).provideModel({ model: 'nope' })
    await expect(model.step(turns, [])).rejects.toThrow(/404.*not found/)
  })

  it('sends attached images in the message’s images, and says it cannot read PDFs', async () => {
    const { fetch, calls } = fakeFetch(ndjson({ message: { content: 'ok' }, done: true }))
    await llama(fetch).step(attachmentTurns, [])

    expect((calls[0].body as { messages: unknown }).messages).toEqual([
      {
        role: 'user',
        content: 'Model this\n\n(The user attached "spec.pdf", but this model can\'t read PDFs.)',
        images: [png.data],
      },
    ])
  })

  it('surfaces errors reported inside the stream', async () => {
    const { fetch } = fakeFetch(ndjson({ error: 'out of memory' }))
    await expect(llama(fetch).step(turns, [])).rejects.toThrow('out of memory')
  })
})

describe('OpenAiCompatibleProvider', () => {
  const gpt = (fetch: typeof globalThis.fetch) =>
    new OpenAiCompatibleProvider({ fetch }).provideModel({ apiKey: 'sk-oa', model: 'gpt-5' })

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

  it('streams a reply from /chat/completions, with the system prompt as a leading message', async () => {
    const { fetch, calls } = fakeFetch(
      sse(
        { choices: [{ delta: { role: 'assistant', content: 'o' } }] },
        { choices: [{ delta: { content: 'k' } }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }] },
      ),
    )
    const streamed = recorder()
    const step = await gpt(fetch).step(turns, [], { systemPrompt: 'Only draw UML.', ...streamed.options })

    expect(step).toEqual({ text: 'ok', toolCalls: [] })
    expect(streamed.text).toEqual(['o', 'k'])
    expect(calls[0]).toMatchObject({
      url: 'https://api.openai.com/v1/chat/completions',
      body: { model: 'gpt-5', stream: true, messages: [{ role: 'system', content: 'Only draw UML.' }, ...turns] },
    })
    expect(calls[0].body).not.toHaveProperty('tools')
  })

  it('offers tools and assembles streamed tool calls and reasoning', async () => {
    const { fetch, calls } = fakeFetch(
      sse(
        { choices: [{ delta: { reasoning_content: 'Validate ' } }] },
        { choices: [{ delta: { reasoning: 'first.' } }] },
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  { index: 0, id: 'call_1', type: 'function', function: { name: 'check_diagram', arguments: '' } },
                ],
              },
            },
          ],
        },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"source":' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"classDiagram"}' } }] } }] },
        { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
      ),
    )
    const streamed = recorder()
    const step = await gpt(fetch).step(turns, [checkTool], streamed.options)

    expect(calls[0].body).toMatchObject({
      tools: [
        {
          type: 'function',
          function: { name: 'check_diagram', description: 'Checks Mermaid source', parameters: checkTool.inputSchema() },
        },
      ],
    })
    expect(streamed.thinking).toEqual(['Validate ', 'first.'])
    expect(step.toolCalls).toEqual([{ id: 'call_1', name: 'check_diagram', args: { source: 'classDiagram' } }])
  })

  it('accepts a plain JSON reply from servers that do not stream', async () => {
    const { fetch } = fakeFetch({
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'Checking.',
            tool_calls: [{ id: 'c', type: 'function', function: { name: 'check_diagram', arguments: '{"source":"x"}' } }],
          },
        },
      ],
    })
    const streamed = recorder()
    const step = await gpt(fetch).step(turns, [checkTool], streamed.options)

    expect(step).toMatchObject({
      text: 'Checking.',
      toolCalls: [{ id: 'c', name: 'check_diagram', args: { source: 'x' } }],
    })
    expect(streamed.text).toEqual(['Checking.'])
  })

  it('replays tool calls and their results in the chat-completions format', async () => {
    const { fetch, calls } = fakeFetch(sse({ choices: [{ delta: { content: 'Done.' } }] }))
    await gpt(fetch).step(toolTurns(), [checkTool])

    expect((calls[0].body as { messages: unknown }).messages).toEqual([
      { role: 'user', content: 'Draw a class' },
      {
        role: 'assistant',
        content: 'Checking.',
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'check_diagram', arguments: '{"source":"classDiagram"}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'call_1', content: 'Valid.' },
    ])
  })

  it('keeps extra fields of tool calls, such as Gemini thought signatures, and sends them back', async () => {
    const signature = { google: { thought_signature: 'sig123' } }
    const { fetch, calls } = fakeFetch(
      sse({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  extra_content: signature,
                  function: { arguments: '{"source":"classDiagram"}', name: 'check_diagram' },
                  id: 'call_9',
                  type: 'function',
                },
              ],
            },
          },
        ],
      }),
      sse({ choices: [{ delta: { content: 'Done.' } }] }),
    )
    const model = gpt(fetch)
    const step = await model.step(turns, [checkTool])
    await model.step(
      [
        ...turns,
        { role: 'assistant', content: step.text, toolCalls: step.toolCalls, native: step.native },
        { role: 'tool', results: [{ callId: 'call_9', name: 'check_diagram', content: 'Valid.' }] },
      ],
      [checkTool],
    )

    expect((calls[1].body as { messages: unknown[] }).messages.at(-2)).toEqual({
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          id: 'call_9',
          type: 'function',
          function: { name: 'check_diagram', arguments: '{"source":"classDiagram"}' },
          extra_content: signature,
        },
      ],
    })
  })

  it('sends attached images as image_url parts and PDFs as file parts', async () => {
    const { fetch, calls } = fakeFetch(sse({ choices: [{ delta: { content: 'ok' } }] }))
    await gpt(fetch).step(attachmentTurns, [])

    expect((calls[0].body as { messages: unknown }).messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Model this' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${png.data}` } },
          { type: 'file', file: { filename: 'spec.pdf', file_data: `data:application/pdf;base64,${pdf.data}` } },
        ],
      },
    ])
  })

  it('falls back to Gemini-style PDFs, then to a note, remembering what works', async () => {
    const ok = () => sse({ choices: [{ delta: { content: 'ok' } }] })
    const { fetch, calls } = fakeFetch(
      new HttpError(400, [{ error: { code: 400, message: 'Invalid content part type: file' } }]),
      ok(),
      ok(),
    )
    const model = gpt(fetch)
    await model.step(attachmentTurns, [])
    await model.step(attachmentTurns, [])

    const pdfPart = (call: Call) => (call.body as { messages: { content: { type: string }[] }[] }).messages[0].content[2]
    expect(pdfPart(calls[1])).toEqual({ type: 'image_url', image_url: { url: `data:application/pdf;base64,${pdf.data}` } })
    expect(pdfPart(calls[2])).toEqual(pdfPart(calls[1]))

    const { fetch: fetch2, calls: calls2 } = fakeFetch(
      new HttpError(400, { error: { message: 'Invalid content part type: file' } }),
      new HttpError(400, { error: { message: 'Unsupported MIME type: application/pdf' } }),
      ok(),
    )
    await gpt(fetch2).step(attachmentTurns, [])
    expect((calls2[2].body as { messages: unknown }).messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Model this\n\n(The user attached "spec.pdf", but this model can\'t read PDFs.)' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${png.data}` } },
        ],
      },
    ])
  })

  it('falls back to no tools for models that reject them, remembering it', async () => {
    const ok = () => sse({ choices: [{ delta: { content: 'ok' } }] })
    const { fetch, calls } = fakeFetch(
      new HttpError(400, { error: { message: 'This model does not support function calling.' } }),
      ok(),
      ok(),
    )
    const model = gpt(fetch)

    expect((await model.step(turns, [checkTool])).text).toBe('ok')
    await model.step(turns, [checkTool])
    expect(calls[0].body).toHaveProperty('tools')
    expect(calls[1].body).not.toHaveProperty('tools')
    expect(calls[2].body).not.toHaveProperty('tools')
  })

  it('remembers what a model supports across replies, per server and model', async () => {
    const ok = () => sse({ choices: [{ delta: { content: 'ok' } }] })
    const { fetch, calls } = fakeFetch(
      new HttpError(400, { error: { message: 'tools are not supported' } }),
      ok(),
      ok(),
      ok(),
    )
    const provider = new OpenAiCompatibleProvider({ fetch })
    await provider.provideModel({ baseUrl: 'http://lm.test/v1', model: 'tiny' }).step(turns, [checkTool])
    await provider.provideModel({ baseUrl: 'http://lm.test/v1', model: 'tiny' }).step(turns, [checkTool])
    await provider.provideModel({ baseUrl: 'http://lm.test/v1', model: 'big' }).step(turns, [checkTool])

    expect(calls.map((c) => 'tools' in (c.body as object))).toEqual([true, false, false, true])
  })

  it('does not retry other errors', async () => {
    const { fetch, calls } = fakeFetch(new HttpError(401, { error: { message: 'Invalid API key' } }))
    await expect(gpt(fetch).step(attachmentTurns, [checkTool])).rejects.toThrow(/401.*Invalid API key/)
    expect(calls).toHaveLength(1)
  })

  it('passes unparseable tool arguments on as empty args', async () => {
    const { fetch } = fakeFetch(
      sse({
        choices: [
          { delta: { tool_calls: [{ index: 0, id: 'c', function: { name: 'check_diagram', arguments: '{"sour' } }] } },
        ],
      }),
    )
    const step = await gpt(fetch).step(turns, [checkTool])
    expect(step.toolCalls).toEqual([{ id: 'c', name: 'check_diagram', args: {} }])
  })
})
