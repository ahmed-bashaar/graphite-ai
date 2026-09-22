import type { LlmModel } from './LlmModel.ts'
import type { Args, Parameter, Parametered } from './Parametered.ts'

export type ProviderOptions = {
  /** Override for tests; defaults to the global fetch, looked up at call time. */
  fetch?: typeof fetch
}

// One function (looked up at call time) so every provider shares what it learns about models.
const defaultFetch: typeof fetch = (input, init) => globalThis.fetch(input, init)

// What providers learned about models (e.g. "rejects tools"), per fetch so injected test fetches stay isolated.
const learnedByFetch = new WeakMap<typeof fetch, Map<string, object>>()

export abstract class LlmProvider implements Parametered {
  name: string
  models: LlmModel[] = []
  protected fetch: typeof fetch

  constructor(name: string, { fetch }: ProviderOptions = {}) {
    this.name = name
    this.fetch = fetch ?? defaultFetch
  }

  /**
   * A mutable record of what's been learned about the model at `key` (e.g.
   * server URL + model name), shared by every model object for it, so a
   * capability found missing in one reply isn't probed again in the next.
   */
  protected learned<T extends object>(key: string, initial: () => T): T {
    let learned = learnedByFetch.get(this.fetch)
    if (!learned) learnedByFetch.set(this.fetch, (learned = new Map()))
    if (!learned.has(key)) learned.set(key, initial())
    return learned.get(key) as T
  }

  /** Builds a model configured by `args`, as described by `exposeParameters()`. */
  abstract provideModel(args: Args): LlmModel

  abstract exposeParameters(): Parameter[]

  /** Model names available with these (possibly partial) `args`; used by settings UIs. */
  abstract listModels(args: Args): Promise<string[]>

  /** `args` with blank or missing values replaced by parameter defaults. */
  protected withDefaults(args: Args): Args {
    const resolved: Args = { ...args }
    for (const p of this.exposeParameters()) {
      if (isBlank(resolved[p.name]) && p.default !== undefined) resolved[p.name] = p.default
    }
    return resolved
  }

  /** Like `withDefaults`, but throws if a required argument is still missing. */
  protected requireArgs(args: Args): Args {
    const resolved = this.withDefaults(args)
    const missing = this.exposeParameters().filter((p) => p.required && isBlank(resolved[p.name]))
    if (missing.length > 0) {
      throw new Error(`${this.name}: missing required setting(s) ${missing.map((p) => p.name).join(', ')}`)
    }
    return resolved
  }
}

const isBlank = (value: unknown) => value === undefined || value === null || value === ''
