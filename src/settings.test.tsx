import { screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './db.ts'
import { expectPath, renderAt } from './test/router.tsx'

async function seedAnthropic() {
  return db.providers.add({
    kind: 'anthropic',
    name: 'Work Claude',
    args: { apiKey: 'sk-old', model: 'claude-opus-5' },
  })
}

describe('settings', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is linked from the projects page and from inside a project', async () => {
    const router = renderAt('/')
    await userEvent.click(screen.getByRole('link', { name: /settings/i }))
    await expectPath(router, '/settings')
    expect(await screen.findByRole('heading', { name: /llm providers/i })).toBeInTheDocument()

    const projectId = await db.projects.add({ name: 'P', createdAt: new Date() })
    await router.navigate(`/projects/${projectId}`)
    await screen.findByRole('navigation', { name: /project/i })
    await userEvent.click(screen.getByRole('link', { name: /settings/i }))
    await expectPath(router, '/settings')
  })

  it('sets how many steps GraphiteAI can take per reply', async () => {
    renderAt('/settings')

    const field = await screen.findByRole('spinbutton', { name: /max steps per reply/i })
    await vi.waitFor(() => expect(field).toHaveValue(12))
    await userEvent.clear(field)
    await userEvent.type(field, '5')
    await userEvent.click(screen.getByRole('button', { name: /save agent settings/i }))

    expect(await screen.findByText(/saved/i)).toBeInTheDocument()
    expect(await db.settings.get('agent')).toMatchObject({ value: { maxSteps: 5 } })
  })

  it('offers Anthropic, Ollama and OpenAI-compatible providers when none are configured', async () => {
    renderAt('/settings')
    expect(await screen.findByText(/no providers yet/i)).toBeInTheDocument()
    for (const kind of [/anthropic/i, /ollama/i, /openai-compatible/i]) {
      expect(screen.getByRole('link', { name: kind })).toBeInTheDocument()
    }
  })

  it('adds an Anthropic provider from a form built from its parameters', async () => {
    const router = renderAt('/settings')
    await userEvent.click(await screen.findByRole('link', { name: /anthropic/i }))
    await expectPath(router, '/settings/providers/new/anthropic')

    expect(await screen.findByLabelText(/name/i)).toHaveValue('Anthropic')
    expect(screen.getByLabelText(/model/i)).toHaveValue('claude-opus-5')
    const apiKey = screen.getByLabelText(/api key/i)
    expect(apiKey).toHaveAttribute('type', 'password')

    await userEvent.type(apiKey, 'sk-ant-test')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    await expectPath(router, '/settings')
    const [record] = await db.providers.toArray()
    expect(record).toMatchObject({
      kind: 'anthropic',
      name: 'Anthropic',
      args: { apiKey: 'sk-ant-test', model: 'claude-opus-5' },
    })
    const list = await screen.findByRole('list', { name: /configured providers/i })
    expect(await within(list).findByText('Anthropic')).toBeInTheDocument()
    expect(within(list).getByText(/claude-opus-5/)).toBeInTheDocument()
    expect(within(list).queryByText(/sk-ant-test/)).toBeNull()
  })

  it('does not save while a required setting is missing', async () => {
    renderAt('/settings/providers/new/anthropic')
    await userEvent.click(await screen.findByRole('button', { name: /save/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/apiKey/)
    expect(await db.providers.count()).toBe(0)
  })

  it('edits an existing provider', async () => {
    const id = await seedAnthropic()
    const router = renderAt('/settings')
    await userEvent.click(await screen.findByRole('link', { name: /work claude/i }))
    await expectPath(router, `/settings/providers/${id}`)

    const model = await screen.findByLabelText(/model/i)
    expect(screen.getByLabelText(/api key/i)).toHaveValue('sk-old')
    await userEvent.clear(model)
    await userEvent.type(model, 'claude-sonnet-5')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    await expectPath(router, '/settings')
    expect((await db.providers.get(id))?.args.model).toBe('claude-sonnet-5')
  })

  it('removes a provider', async () => {
    const id = await seedAnthropic()
    const router = renderAt(`/settings/providers/${id}`)
    await userEvent.click(await screen.findByRole('button', { name: /remove/i }))

    await expectPath(router, '/settings')
    expect(await db.providers.count()).toBe(0)
  })

  it('loads the available models from the provider', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ models: [{ name: 'llama3.2' }, { name: 'qwen3:8b' }] })),
    )
    renderAt('/settings/providers/new/ollama')
    await userEvent.click(await screen.findByRole('button', { name: /load models/i }))

    expect(await screen.findByText(/2 models available/i)).toBeInTheDocument()
    const options = document.querySelectorAll('datalist option')
    expect([...options].map((o) => o.getAttribute('value'))).toEqual(['llama3.2', 'qwen3:8b'])
    expect(fetch).toHaveBeenCalledWith('http://localhost:11434/api/tags', expect.anything())
  })

  it('shows why loading models failed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    renderAt('/settings/providers/new/ollama')
    await userEvent.click(await screen.findByRole('button', { name: /load models/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/failed to fetch/i)
  })

  it('reports an unknown provider type', async () => {
    renderAt('/settings/providers/new/nope')
    expect(await screen.findByText(/provider type not found/i)).toBeInTheDocument()
  })
})
