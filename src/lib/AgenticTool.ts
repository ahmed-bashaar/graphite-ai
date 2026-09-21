import type { Args, Parameter, Parametered } from './Parametered.ts'

export type AgenticToolInit = {
  name: string
  description: string
  parameters?: Parameter[]
  handler: (args: Args) => unknown
}

export class AgenticTool implements Parametered {
  name: string
  description: string
  private parameters: Parameter[]
  private handler: (args: Args) => unknown

  constructor({ name, description, parameters = [], handler }: AgenticToolInit) {
    this.name = name
    this.description = description
    this.parameters = parameters
    this.handler = handler
  }

  async call(args: Args): Promise<unknown> {
    const missing = this.parameters.filter((p) => p.required && !(p.name in args))
    if (missing.length > 0) {
      throw new Error(`${this.name}: missing required argument(s) ${missing.map((p) => p.name).join(', ')}`)
    }
    return this.handler(args)
  }

  exposeParameters(): Parameter[] {
    return this.parameters
  }
}
