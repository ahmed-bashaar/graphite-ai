import Anthropic from '@anthropic-ai/sdk'
import { toChatTurns } from './chatTurns.ts'
import { LlmModel } from './LlmModel.ts'
import { LlmProvider, type ProviderOptions } from './LlmProvider.ts'
import type { Message } from './Message.ts'
import { MessagePart } from './MessagePart.ts'
import type { Args, Parameter } from './Parametered.ts'

// Models that accept server-side refusal fallbacks (`fallbacks: "default"`).
const FALLBACK_MODELS = new Set(['claude-opus-5', 'claude-fable-5-1'])

export class AnthropicProvider extends LlmProvider {
  constructor(options?: ProviderOptions) {
    super('Anthropic', options)
  }

  exposeParameters(): Parameter[] {
    return [
      {
        name: 'apiKey',
        type: 'string',
        required: true,
        secret: true,
        description: 'From console.anthropic.com. Stored only in this browser.',
      },
      { name: 'model', type: 'string', required: true, default: 'claude-opus-5' },
    ]
  }

  async listModels(args: Args): Promise<string[]> {
    const ids: string[] = []
    for await (const model of this.client(this.withDefaults(args)).models.list()) ids.push(model.id)
    return ids
  }

  provideModel(args: Args): LlmModel {
    const resolved = this.requireArgs(args)
    return new AnthropicModel(String(resolved.model), this.client(resolved))
  }

  private client(args: Args): Anthropic {
    // The app has no backend: requests go straight from the browser with the user's own key.
    return new Anthropic({ apiKey: String(args.apiKey ?? ''), dangerouslyAllowBrowser: true, fetch: this.fetch })
  }
}

class AnthropicModel extends LlmModel {
  private client: Anthropic

  constructor(name: string, client: Anthropic) {
    super(name)
    this.client = client
  }

  // Tools are not passed to the API yet.
  async complete(history: Message[]): Promise<MessagePart[]> {
    const response = await this.client.beta.messages.create({
      model: this.name,
      max_tokens: 16000,
      messages: toChatTurns(history),
      ...(FALLBACK_MODELS.has(this.name) && {
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default' as const,
      }),
    })
    if (response.stop_reason === 'refusal') {
      const explanation = response.stop_details?.explanation
      throw new Error(`Claude declined this request${explanation ? `: ${explanation}` : '.'}`)
    }
    return response.content.flatMap((block) => (block.type === 'text' ? [new MessagePart('text', block.text)] : []))
  }
}
