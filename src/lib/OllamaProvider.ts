import { toChatTurns, withSystem } from './chatTurns.ts'
import { joinUrl, requestJson } from './http.ts'
import { LlmModel } from './LlmModel.ts'
import { LlmProvider, type ProviderOptions } from './LlmProvider.ts'
import type { Message } from './Message.ts'
import { MessagePart } from './MessagePart.ts'
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

class OllamaModel extends LlmModel {
  private baseUrl: string
  private fetch: typeof fetch

  constructor(name: string, baseUrl: string, fetch: typeof globalThis.fetch) {
    super(name)
    this.baseUrl = baseUrl
    this.fetch = fetch
  }

  // Tools are not passed to the API yet.
  async complete(history: Message[], _tools: unknown, systemPrompt = ''): Promise<MessagePart[]> {
    const data = await requestJson<{ message: { content: string } }>(this.fetch, joinUrl(this.baseUrl, '/api/chat'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: this.name, messages: withSystem(systemPrompt, toChatTurns(history)), stream: false }),
    })
    return [new MessagePart('text', data.message.content)]
  }
}
