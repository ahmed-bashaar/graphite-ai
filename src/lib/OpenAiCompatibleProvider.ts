import { toChatTurns } from './chatTurns.ts'
import { joinUrl, requestJson } from './http.ts'
import { LlmModel } from './LlmModel.ts'
import { LlmProvider, type ProviderOptions } from './LlmProvider.ts'
import type { Message } from './Message.ts'
import { MessagePart } from './MessagePart.ts'
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

  // Tools are not passed to the API yet.
  async complete(history: Message[]): Promise<MessagePart[]> {
    const data = await requestJson<{ choices: { message: { content: string | null } }[] }>(
      this.fetch,
      joinUrl(this.baseUrl, '/chat/completions'),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders(this.apiKey) },
        body: JSON.stringify({ model: this.name, messages: toChatTurns(history) }),
      },
    )
    return [new MessagePart('text', data.choices[0]?.message.content ?? '')]
  }
}

function authHeaders(apiKey: unknown): Record<string, string> {
  return apiKey ? { authorization: `Bearer ${String(apiKey)}` } : {}
}
