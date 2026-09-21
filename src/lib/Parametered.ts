export type ParameterType = 'string' | 'number' | 'boolean' | 'object' | 'array'

export type Parameter = {
  name: string
  type: ParameterType
  description?: string
  required?: boolean
}

export type Args = Record<string, unknown>

/** Something that describes its own configurable arguments. */
export interface Parametered {
  exposeParameters(): Parameter[]
}
