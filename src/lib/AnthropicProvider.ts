import Anthropic from '@anthropic-ai/sdk'
import type { AgenticTool } from './AgenticTool.ts'
import type { ChatTurn } from './chatTurns.ts'
import { LlmModel, type ModelStep, type StepOptions } from './LlmModel.ts'
import { LlmProvider, type ProviderOptions } from './LlmProvider.ts'
import type { Args, Parameter } from './Parametered.ts'

type ContentBlock = Anthropic.Beta.BetaContentBlock
type MessageParam = Anthropic.Beta.BetaMessageParam

// Models that accept server-side refusal fallbacks (`fallbacks: "default"`).
const FALLBACK_MODELS = new Set(['claude-opus-5', 'claude-fable-5-1'])

// Models that take adaptive thinking. Older ones (e.g. Haiku 4.5) reject it.
const ADAPTIVE_THINKING = /^claude-(opus-5|opus-4-[678]|sonnet-5|sonnet-4-6|fable-5|mythos-5)/

// Model-internal blocks that must not be echoed from before a mid-output fallback.
const PRE_FALLBACK_DROPPED = new Set(['thinking', 'redacted_thinking', 'tool_use', 'server_tool_use'])

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

  async step(turns: ChatTurn[], tools: AgenticTool[], options: StepOptions = {}): Promise<ModelStep> {
    const { systemPrompt, onText, onThinking, signal } = options
    const stream = this.client.beta.messages.stream(
      {
        model: this.name,
        max_tokens: 64000,
        ...(systemPrompt && { system: systemPrompt }),
        messages: toMessages(turns),
        ...(tools.length > 0 && {
          tools: tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.inputSchema(),
          })),
        }),
        // Summaries of the model's reasoning are shown while it works.
        ...(ADAPTIVE_THINKING.test(this.name) && { thinking: { type: 'adaptive', display: 'summarized' } as const }),
        ...(FALLBACK_MODELS.has(this.name) && {
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default' as const,
        }),
      },
      { signal },
    )
    for await (const event of stream) {
      if (event.type !== 'content_block_delta') continue
      if (event.delta.type === 'text_delta') onText?.(event.delta.text)
      else if (event.delta.type === 'thinking_delta') onThinking?.(event.delta.thinking)
    }
    const response = await stream.finalMessage()

    if (response.stop_reason === 'refusal') {
      const explanation = response.stop_details?.explanation
      throw new Error(`Claude declined this request${explanation ? `: ${explanation}` : '.'}`)
    }
    const content = echoable(response.content)
    const toolCalls = content.flatMap((block) =>
      block.type === 'tool_use' ? [{ id: block.id, name: block.name, args: (block.input ?? {}) as Args }] : [],
    )
    if (response.stop_reason === 'max_tokens' && toolCalls.length > 0) {
      throw new Error('The reply hit the token limit in the middle of a tool call.')
    }
    const text = content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
    return { text, toolCalls, native: content }
  }
}

/**
 * `content` as it may be sent back. After a mid-output fallback, thinking and
 * tool calls from before the (last) `fallback` block belong to the declined
 * attempt: they are dropped, while its text stays as the answer's beginning.
 */
function echoable(content: ContentBlock[]): ContentBlock[] {
  const boundary = content.findLastIndex((block) => block.type === 'fallback')
  return content.filter((block, i) => i > boundary || !PRE_FALLBACK_DROPPED.has(block.type))
}

function toMessages(turns: ChatTurn[]): MessageParam[] {
  return turns.map((turn): MessageParam => {
    if (turn.role === 'tool') {
      return {
        role: 'user',
        content: turn.results.map((r) => ({
          type: 'tool_result' as const,
          tool_use_id: r.callId,
          content: r.content,
          ...(r.isError && { is_error: true }),
        })),
      }
    }
    if (turn.role === 'user') return turn
    // Replay the model's own blocks unchanged: thinking signatures must survive the tool loop.
    if ('native' in turn && turn.native) {
      return { role: 'assistant', content: turn.native as Anthropic.Beta.BetaContentBlockParam[] }
    }
    if ('toolCalls' in turn && turn.toolCalls?.length) {
      return {
        role: 'assistant',
        content: [
          ...(turn.content ? [{ type: 'text' as const, text: turn.content }] : []),
          ...turn.toolCalls.map((c) => ({ type: 'tool_use' as const, id: c.id, name: c.name, input: c.args })),
        ],
      }
    }
    return { role: 'assistant', content: turn.content }
  })
}
