import type { AgenticTool } from './AgenticTool.ts'
import type { ChatTurn, ToolCall } from './chatTurns.ts'
import { joinUrl, readServerSentEvents, request, requestJson } from './http.ts'
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
    return new OpenAiCompatibleModel(String(model), String(baseUrl), apiKey, this.fetch)
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

class OpenAiCompatibleModel extends LlmModel {
  private baseUrl: string
  private apiKey: unknown
  private fetch: typeof fetch

  constructor(name: string, baseUrl: string, apiKey: unknown, fetch: typeof globalThis.fetch) {
    super(name)
    this.baseUrl = baseUrl
    this.apiKey = apiKey
    this.fetch = fetch
  }

  async step(turns: ChatTurn[], tools: AgenticTool[], options: StepOptions = {}): Promise<ModelStep> {
    const { systemPrompt, onText, onThinking, signal } = options
    const response = await request(this.fetch, joinUrl(this.baseUrl, '/chat/completions'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeaders(this.apiKey) },
      signal,
      body: JSON.stringify({
        model: this.name,
        messages: [...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []), ...toMessages(turns)],
        ...(tools.length > 0 && {
          tools: tools.map((tool) => ({
            type: 'function',
            function: { name: tool.name, description: tool.description, parameters: tool.inputSchema() },
          })),
        }),
        stream: true,
      }),
    })

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

function toMessages(turns: ChatTurn[]): Record<string, unknown>[] {
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
    return [{ role: turn.role, content: turn.content }]
  })
}

function authHeaders(apiKey: unknown): Record<string, string> {
  return apiKey ? { authorization: `Bearer ${String(apiKey)}` } : {}
}
