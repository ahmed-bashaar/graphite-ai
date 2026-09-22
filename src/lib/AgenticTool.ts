import type { Args, Parameter, Parametered } from './Parametered.ts'

export type JsonSchema = {
  type: 'object'
  properties: Record<string, { type: string; description?: string }>
  required: string[]
}

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

  /** The parameters as a JSON Schema object, the shape tool-calling APIs expect. */
  inputSchema(): JsonSchema {
    const properties: Record<string, { type: string; description?: string }> = {}
    for (const { name, type, description } of this.parameters) {
      properties[name] = description ? { type, description } : { type }
    }
    return { type: 'object', properties, required: this.parameters.filter((p) => p.required).map((p) => p.name) }
  }
}
