import type { AgenticTool } from './AgenticTool.ts'
import type { ChatTurn, ToolCall } from './chatTurns.ts'
import { joinUrl, readLines, request, requestJson } from './http.ts'
import { LlmModel, type ModelStep, type StepOptions } from './LlmModel.ts'
import { LlmProvider, type ProviderOptions } from './LlmProvider.ts'
import type { Args, Parameter } from './Parametered.ts'

/** A local (or self-hosted) Ollama server, via its REST API. */
export class OllamaProvider extends LlmProvider {
  constructor(options?: ProviderOptions) {
    super('Ollama', options)
  }

  exposeParameters(): Parameter[] {
    return [
      {
        name: 'baseUrl',
        type: 'string',
        required: true,
        default: 'http://localhost:11434',
        description: 'Other hosts must allow this app in OLLAMA_ORIGINS.',
      },
      { name: 'model', type: 'string', required: true, description: 'e.g. llama3.2 (see `ollama list`)' },
    ]
  }

  async listModels(args: Args): Promise<string[]> {
    const { baseUrl } = this.withDefaults(args)
    const data = await requestJson<{ models: { name: string }[] }>(this.fetch, joinUrl(String(baseUrl), '/api/tags'))
    return data.models.map((model) => model.name)
  }

  provideModel(args: Args): LlmModel {
    const { baseUrl, model } = this.requireArgs(args)
    return new OllamaModel(String(model), String(baseUrl), this.fetch)
  }
}

type OllamaToolCall = { id?: string; function: { name: string; arguments: Args } }

type ChatChunk = {
  message?: { content?: string; thinking?: string; tool_calls?: OllamaToolCall[] }
  error?: string
}

class OllamaModel extends LlmModel {
  private baseUrl: string
  private fetch: typeof fetch
  /** Set once the server says this model can't call tools. */
  private toolsUnsupported = false

  constructor(name: string, baseUrl: string, fetch: typeof globalThis.fetch) {
    super(name)
    this.baseUrl = baseUrl
    this.fetch = fetch
  }

  async step(turns: ChatTurn[], tools: AgenticTool[], options: StepOptions = {}): Promise<ModelStep> {
    const offered = this.toolsUnsupported ? [] : tools
    let response: Response
    try {
      response = await this.request(turns, offered, options)
    } catch (error) {
      // Not every model supports tools; they can still answer (and have their answer checked) without them.
      if (offered.length === 0 || !(error instanceof Error) || !/does not support tools/i.test(error.message)) {
        throw error
      }
      this.toolsUnsupported = true
      response = await this.request(turns, [], options)
    }

    let text = ''
    const toolCalls: ToolCall[] = []
    // The reply streams as one JSON object per line.
    for await (const line of readLines(response)) {
      const chunk = JSON.parse(line) as ChatChunk
      if (chunk.error) throw new Error(chunk.error)
      const { content, thinking, tool_calls } = chunk.message ?? {}
      if (thinking) options.onThinking?.(thinking)
      if (content) {
        text += content
        options.onText?.(content)
      }
      for (const call of tool_calls ?? []) {
        toolCalls.push({
          id: call.id ?? `call_${toolCalls.length + 1}`,
          name: call.function.name,
          args: call.function.arguments ?? {},
        })
      }
    }
    return { text, toolCalls }
  }

  private request(turns: ChatTurn[], tools: AgenticTool[], { systemPrompt, signal }: StepOptions) {
    return request(this.fetch, joinUrl(this.baseUrl, '/api/chat'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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
  }
}

function toMessages(turns: ChatTurn[]): Record<string, unknown>[] {
  return turns.flatMap((turn): Record<string, unknown>[] => {
    if (turn.role === 'tool') {
      return turn.results.map((r) => ({ role: 'tool', tool_name: r.name, content: r.content }))
    }
    if (turn.role === 'assistant' && 'toolCalls' in turn && turn.toolCalls?.length) {
      return [
        {
          role: 'assistant',
          content: turn.content,
          tool_calls: turn.toolCalls.map((c) => ({ function: { name: c.name, arguments: c.args } })),
        },
      ]
    }
    return [{ role: turn.role, content: turn.content }]
  })
}
