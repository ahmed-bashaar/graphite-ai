import {
  AnthropicProvider,
  OllamaProvider,
  OpenAiCompatibleProvider,
  type LlmProvider,
} from './lib/index.ts'

type ProviderKindInfo = {
  label: string
  description: string
  create: () => LlmProvider
}

/** Every provider a user can configure in Settings. Add new ones here. */
export const providerKinds = {
  anthropic: {
    label: 'Anthropic',
    description: 'Claude models through the Anthropic API.',
    create: () => new AnthropicProvider(),
  },
  ollama: {
    label: 'Ollama',
    description: 'Open models running locally with Ollama.',
    create: () => new OllamaProvider(),
  },
  'openai-compatible': {
    label: 'OpenAI-compatible',
    description: 'OpenAI, OpenRouter, Groq, LM Studio, or any other OpenAI-style API.',
    create: () => new OpenAiCompatibleProvider(),
  },
} satisfies Record<string, ProviderKindInfo>

export type ProviderKind = keyof typeof providerKinds

export function isProviderKind(kind: string | undefined): kind is ProviderKind {
  return kind !== undefined && Object.hasOwn(providerKinds, kind)
}
