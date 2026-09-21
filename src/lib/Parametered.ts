export type ParameterType = 'string' | 'number' | 'boolean' | 'object' | 'array'

export type Parameter = {
  name: string
  type: ParameterType
  description?: string
  required?: boolean
  /** Credentials: UIs should mask the value. */
  secret?: boolean
  /** Used when the argument is left out or blank. */
  default?: string | number | boolean
}

export type Args = Record<string, unknown>

/** Something that describes its own configurable arguments. */
export interface Parametered {
  exposeParameters(): Parameter[]
}
