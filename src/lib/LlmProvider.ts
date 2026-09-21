import type { LlmModel } from './LlmModel.ts'
import type { Args, Parameter, Parametered } from './Parametered.ts'

export abstract class LlmProvider implements Parametered {
  name: string
  models: LlmModel[] = []

  constructor(name: string) {
    this.name = name
  }

  /** Builds (or reuses) a model configured by `args`, as described by `exposeParameters()`. */
  abstract provideModel(args: Args): LlmModel

  abstract exposeParameters(): Parameter[]
}
