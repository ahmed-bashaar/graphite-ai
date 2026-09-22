import type { AgenticTool } from './AgenticTool.ts'
import { unreadablePdfNote, type ChatTurn, type ToolCall } from './chatTurns.ts'
import { HttpError, joinUrl, readServerSentEvents, request, requestJson } from './http.ts'
import { LlmModel, type ModelStep, type StepOptions } from './LlmModel.ts'
import { LlmProvider, type ProviderOptions } from './LlmProvider.ts'
import type { Args, Parameter } from './Parametered.ts'

/**
 * Any server speaking the OpenAI chat-completions API: OpenAI itself,
 * OpenRouter, Groq, LM Studio, vLLM, llama.cpp, ...
 */
export class OpenAiCompatibleProvider extends LlmProvider {
  constructor(options?: ProviderOptions) {
    super('OpenAI-compatible', options)
  }

  exposeParameters(): Parameter[] {
    return [
      {
        name: 'baseUrl',
        type: 'string',
        required: true,
        default: 'https://api.openai.com/v1',
        description: 'e.g. https://openrouter.ai/api/v1 or http://localhost:1234/v1',
      },
      {
        name: 'apiKey',
        type: 'string',
        secret: true,
        description: 'Leave empty for local servers. Stored only in this browser.',
      },
      { name: 'model', type: 'string', required: true },
    ]
  }

  async listModels(args: Args): Promise<string[]> {
    const { baseUrl, apiKey } = this.withDefaults(args)
    const data = await requestJson<{ data: { id: string }[] }>(this.fetch, joinUrl(String(baseUrl), '/models'), {
      headers: authHeaders(apiKey),
    })
    return data.data.map((model) => model.id)
  }

  provideModel(args: Args): LlmModel {
    const { baseUrl, apiKey, model } = this.requireArgs(args)
    const support = this.learned(`${String(baseUrl)}|${String(model)}`, (): Support => ({ tools: true, pdf: 'file' }))
    return new OpenAiCompatibleModel(String(model), String(baseUrl), apiKey, this.fetch, support)
  }
}

// Servers may add fields, e.g. Gemini's `extra_content` thought signature, that must be sent back as they came.
type WireToolCall = {
  index?: number
  id?: string
  type?: string
  function?: { name?: string; arguments?: string }
  [extra: string]: unknown
}

const STANDARD_FIELDS = new Set(['index', 'id', 'type', 'function'])

/** A complete tool call as the chat-completions API sends and receives it. */
type FullToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } } & Record<string, unknown>

// Streamed deltas and whole messages share this shape. Reasoning models send
// their reasoning as `reasoning_content` (DeepSeek, LM Studio) or `reasoning` (OpenRouter).
type WireMessage = {
  content?: string | null
  reasoning_content?: string | null
  reasoning?: string | null
  tool_calls?: WireToolCall[]
}

type Completion = { choices?: { delta?: WireMessage; message?: WireMessage }[] }

/**
 * How PDFs are sent: OpenAI's `file` part, the `image_url` data URL Gemini's
 * endpoint expects, or not at all (a note says the model can't read them).
 */
type PdfFormat = 'file' | 'image_url' | 'none'

const NEXT_PDF_FORMAT: Record<PdfFormat, PdfFormat | null> = { file: 'image_url', image_url: 'none', none: null }

/** What a server and model accept, learned from its 400 responses and shared across replies. */
type Support = { tools: boolean; pdf: PdfFormat }

class OpenAiCompatibleModel extends LlmModel {
  private baseUrl: string
  private apiKey: unknown
  private fetch: typeof fetch
  private support: Support

  constructor(name: string, baseUrl: string, apiKey: unknown, fetch: typeof globalThis.fetch, support: Support) {
    super(name)
    this.baseUrl = baseUrl
    this.apiKey = apiKey
    this.fetch = fetch
    this.support = support
  }

  async step(turns: ChatTurn[], tools: AgenticTool[], options: StepOptions = {}): Promise<ModelStep> {
    const { onText, onThinking } = options
    const response = await this.request(turns, tools, options)

    let text = ''
    // Tool calls stream in pieces keyed by index: the id and name first, then the arguments JSON.
    const calls: { id: string; name: string; arguments: string; extra: Record<string, unknown> }[] = []
    const take = (message: WireMessage | undefined) => {
      if (!message) return
      const reasoning = message.reasoning_content ?? message.reasoning
      if (reasoning) onThinking?.(reasoning)
      if (message.content) {
        text += message.content
        onText?.(message.content)
      }
      for (const [position, piece] of (message.tool_calls ?? []).entries()) {
        const { index, id, function: fn } = piece
        const extra = Object.fromEntries(Object.entries(piece).filter(([key]) => !STANDARD_FIELDS.has(key)))
        const call = (calls[index ?? position] ??= { id: '', name: '', arguments: '', extra: {} })
        if (id) call.id = id
        if (fn?.name) call.name += fn.name
        if (fn?.arguments) call.arguments += fn.arguments
        Object.assign(call.extra, extra)
      }
    }

    // Some servers ignore `stream` and answer with one JSON completion.
    if (response.headers.get('content-type')?.includes('text/event-stream')) {
      for await (const event of readServerSentEvents(response)) take((JSON.parse(event) as Completion).choices?.[0]?.delta)
    } else {
      take(((await response.json()) as Completion).choices?.[0]?.message)
    }

    const wire = calls.filter(Boolean).map(
      (call, i): FullToolCall => ({
        id: call.id || `call_${i + 1}`,
        type: 'function',
        function: { name: call.name, arguments: call.arguments },
        ...call.extra,
      }),
    )
    if (wire.length === 0) return { text, toolCalls: [] }
    const toolCalls = wire.map((call): ToolCall => ({ id: call.id, name: call.function.name, args: parseArgs(call.function.arguments) }))
    // The calls exactly as received, for replay.
    return { text, toolCalls, native: wire }
  }

  /**
   * Sends the request, stepping down when the server rejects (400) what this
   * model doesn't support: tools, then the PDF formats.
   */
  private async request(turns: ChatTurn[], tools: AgenticTool[], { systemPrompt, signal }: StepOptions) {
    const hasPdf = turns.some((t) => 'attachments' in t && t.attachments?.some((a) => a.mediaType === 'application/pdf'))
    for (;;) {
      const offered = this.support.tools ? tools : []
      try {
        return await request(this.fetch, joinUrl(this.baseUrl, '/chat/completions'), {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...authHeaders(this.apiKey) },
          signal,
          body: JSON.stringify({
            model: this.name,
            messages: [
              ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
              ...toMessages(turns, this.support.pdf),
            ],
            ...(offered.length > 0 && {
              tools: offered.map((tool) => ({
                type: 'function',
                function: { name: tool.name, description: tool.description, parameters: tool.inputSchema() },
              })),
            }),
            stream: true,
          }),
        })
      } catch (error) {
        if (!(error instanceof HttpError) || error.status !== 400) throw error
        const nextPdf = NEXT_PDF_FORMAT[this.support.pdf]
        if (offered.length > 0 && /tool|function/i.test(error.message)) this.support.tools = false
        else if (hasPdf && nextPdf) this.support.pdf = nextPdf
        else throw error
      }
    }
  }
}

// Malformed arguments become empty args; the tool then reports what's missing to the model.
function parseArgs(json: string): Args {
  try {
    const args: unknown = JSON.parse(json || '{}')
    return args && typeof args === 'object' && !Array.isArray(args) ? (args as Args) : {}
  } catch {
    return {}
  }
}

function toMessages(turns: ChatTurn[], pdfFormat: PdfFormat): Record<string, unknown>[] {
  return turns.flatMap((turn): Record<string, unknown>[] => {
    if (turn.role === 'tool') {
      return turn.results.map((r) => ({ role: 'tool', tool_call_id: r.callId, content: r.content }))
    }
    if (turn.role === 'assistant' && 'toolCalls' in turn && turn.toolCalls?.length) {
      const toolCalls = Array.isArray(turn.native)
        ? (turn.native as FullToolCall[])
        : turn.toolCalls.map(
            (c): FullToolCall => ({
              id: c.id,
              type: 'function',
              function: { name: c.name, arguments: JSON.stringify(c.args) },
            }),
          )
      return [{ role: 'assistant', content: turn.content, tool_calls: toolCalls }]
    }
    if ('attachments' in turn && turn.attachments?.length) {
      const note = pdfFormat === 'none' ? unreadablePdfNote(turn.attachments) : ''
      const text = [turn.content, note].filter(Boolean).join('\n\n')
      return [
        {
          role: turn.role,
          content: [
            ...(text ? [{ type: 'text', text }] : []),
            ...turn.attachments.flatMap((a): Record<string, unknown>[] => {
              const url = `data:${a.mediaType};base64,${a.data}`
              if (a.mediaType !== 'application/pdf') return [{ type: 'image_url', image_url: { url } }]
              if (pdfFormat === 'file') return [{ type: 'file', file: { filename: a.name, file_data: url } }]
              return pdfFormat === 'image_url' ? [{ type: 'image_url', image_url: { url } }] : []
            }),
          ],
        },
      ]
    }
    return [{ role: turn.role, content: turn.content }]
  })
}

function authHeaders(apiKey: unknown): Record<string, string> {
  return apiKey ? { authorization: `Bearer ${String(apiKey)}` } : {}
}
