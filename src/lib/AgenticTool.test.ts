import { describe, expect, it, vi } from 'vitest'
import { AgenticTool, type AgenticToolInit } from './AgenticTool.ts'

describe('AgenticTool', () => {
  const makeTool = (handler: AgenticToolInit['handler'] = vi.fn()) =>
    new AgenticTool({
      name: 'greet',
      description: 'Greets someone',
      parameters: [
        { name: 'name', type: 'string', required: true },
        { name: 'loud', type: 'boolean' },
      ],
      handler,
    })

  it('exposes its parameters', () => {
    expect(makeTool().exposeParameters().map((p) => p.name)).toEqual(['name', 'loud'])
  })

  it('calls the handler with the given args', async () => {
    const handler = vi.fn(() => 'ok')
    const tool = makeTool(handler)

    await expect(tool.call({ name: 'Ada' })).resolves.toBe('ok')
    expect(handler).toHaveBeenCalledWith({ name: 'Ada' })
  })

  it('rejects without calling the handler when a required arg is missing', async () => {
    const handler = vi.fn()
    const tool = makeTool(handler)

    await expect(tool.call({ loud: true })).rejects.toThrow('greet: missing required argument(s) name')
    expect(handler).not.toHaveBeenCalled()
  })

  it('awaits async handlers', async () => {
    const tool = makeTool(vi.fn(async () => 42))
    await expect(tool.call({ name: 'x' })).resolves.toBe(42)
  })

  it('describes its parameters as a JSON Schema for tool-calling APIs', () => {
    const tool = new AgenticTool({
      name: 'greet',
      description: 'Greets someone',
      parameters: [
        { name: 'name', type: 'string', required: true, description: 'Who to greet' },
        { name: 'loud', type: 'boolean' },
      ],
      handler: vi.fn(),
    })
    expect(tool.inputSchema()).toEqual({
      type: 'object',
      properties: { name: { type: 'string', description: 'Who to greet' }, loud: { type: 'boolean' } },
      required: ['name'],
    })
  })
})
