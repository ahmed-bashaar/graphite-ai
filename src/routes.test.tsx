import { screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderMermaid } from './components/renderMermaid.ts'
import { db } from './db.ts'
import { expectPath, renderAt } from './test/router.tsx'

async function seedProject(name = 'Library system') {
  return db.projects.add({ name, createdAt: new Date() })
}

async function seedChat() {
  const projectId = await seedProject()
  const chatSessionId = await db.chatSessions.add({ projectId, draft: '', title: 'New chat' })
  return { projectId, chatSessionId }
}

function seedOllama() {
  return db.providers.add({ kind: 'ollama', name: 'Local', args: { baseUrl: 'http://ollama.test', model: 'llama3.2' } })
}

function stubOllamaReply(content: string) {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ message: { role: 'assistant', content } })))
}

/**
 * Stubs fetch as an Ollama server whose streamed replies the test writes line
 * by line. A stopped (aborted) request ends its stream with an AbortError.
 */
function stubOllamaStream() {
  const encoder = new TextEncoder()
  const stream: { requests: number; push: (message: object, done?: boolean) => void; close: () => void } = {
    requests: 0,
    push: () => {},
    close: () => {},
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      stream.requests++
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          stream.push = (message, done = false) =>
            controller.enqueue(encoder.encode(JSON.stringify({ message, done }) + '\n'))
          stream.close = () => controller.close()
          init?.signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')))
        },
      })
      return new Response(body)
    }),
  )
  return stream
}

describe('routes', () => {
  // Reset before (not after) each test so no mounted live query sees a closed db.
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('projects page', () => {
    it('is the landing page and shows an empty state', async () => {
      renderAt('/')
      expect(screen.getByRole('heading', { name: /projects/i })).toBeInTheDocument()
      expect(await screen.findByText(/no projects yet/i)).toBeInTheDocument()
    })

    it('creates a project and opens it', async () => {
      const router = renderAt('/')
      await userEvent.type(screen.getByLabelText(/project name/i), 'Library system')
      await userEvent.click(screen.getByRole('button', { name: /create project/i }))

      const [project] = await db.projects.toArray()
      expect(project.name).toBe('Library system')
      await expectPath(router, `/projects/${project.id}`)
    })

    it('lists existing projects as links into the project', async () => {
      const id = await seedProject()
      const router = renderAt('/')
      await userEvent.click(await screen.findByRole('link', { name: /library system/i }))
      await expectPath(router, `/projects/${id}`)
    })
  })

  describe('project layout', () => {
    it('shows the project name in the top bar and links back to projects', async () => {
      const id = await seedProject()
      const router = renderAt(`/projects/${id}`)
      const banner = screen.getByRole('banner')
      expect(await within(banner).findByText('Library system')).toBeInTheDocument()

      await userEvent.click(screen.getByRole('link', { name: /graphiteai/i }))
      await expectPath(router, '/')
    })

    it('lists the project chat sessions and diagrams in the sidebar', async () => {
      const projectId = await seedProject()
      await db.chatSessions.add({ projectId, draft: '', title: 'Class model' })
      await db.diagrams.add({ projectId, type: 'class', name: 'Domain', source: '' })
      renderAt(`/projects/${projectId}`)

      const sidebar = screen.getByRole('navigation', { name: /project/i })
      expect(await within(sidebar).findByRole('link', { name: /class model/i })).toBeInTheDocument()
      expect(await within(sidebar).findByRole('link', { name: /domain/i })).toBeInTheDocument()
    })

    it('starts a new chat session and opens it', async () => {
      const projectId = await seedProject()
      const router = renderAt(`/projects/${projectId}`)
      await userEvent.click(await screen.findByRole('button', { name: /new chat/i }))

      const [session] = await db.chatSessions.toArray()
      expect(session.projectId).toBe(projectId)
      await expectPath(router, `/projects/${projectId}/chats/${session.id}`)
    })

    it('reports a missing project', async () => {
      renderAt('/projects/999')
      expect(await screen.findByText(/project not found/i)).toBeInTheDocument()
    })
  })

  describe('chat page', () => {
    it('shows user messages on the right and agent messages on the left', async () => {
      const projectId = await seedProject()
      const chatSessionId = await db.chatSessions.add({ projectId, draft: '', title: 'New chat' })
      await db.messages.bulkAdd([
        { chatSessionId, sender: 'user', on: new Date(1), isSent: true, parts: [{ type: 'text', content: 'Draw a class' }] },
        { chatSessionId, sender: 'GraphiteAI', on: new Date(2), isSent: true, parts: [{ type: 'text', content: 'Here it is' }] },
      ])
      renderAt(`/projects/${projectId}/chats/${chatSessionId}`)

      const items = await screen.findAllByRole('article')
      expect(items).toHaveLength(2)
      expect(items[0]).toHaveTextContent('Draw a class')
      expect(items[0]).toHaveAttribute('data-sender', 'user')
      expect(items[1]).toHaveTextContent('Here it is')
      expect(items[1]).toHaveAttribute('data-sender', 'agent')
    })

    it('escapes message text instead of injecting HTML', async () => {
      const projectId = await seedProject()
      const chatSessionId = await db.chatSessions.add({ projectId, draft: '', title: 'New chat' })
      await db.messages.add({
        chatSessionId, sender: 'GraphiteAI', on: new Date(), isSent: true,
        parts: [{ type: 'text', content: '<b>bold</b>' }],
      })
      renderAt(`/projects/${projectId}/chats/${chatSessionId}`)

      const [item] = await screen.findAllByRole('article')
      expect(item).toHaveTextContent('<b>bold</b>')
      expect(item.querySelector('b')).toBeNull()
    })

    it('sends a message and shows the agent reply, saving its diagram to the project', async () => {
      const { projectId, chatSessionId } = await seedChat()
      await seedOllama()
      stubOllamaReply('Here you go:\n\n```mermaid\n---\ntitle: Domain\n---\nclassDiagram\n  class Book\n```')
      renderAt(`/projects/${projectId}/chats/${chatSessionId}`)

      const input = await screen.findByRole('textbox', { name: /message/i })
      await userEvent.type(input, 'Model a library{Enter}')
      expect(input).toHaveValue('')

      // Wait for the saved reply, not the live one that streams in first.
      await vi.waitFor(() => {
        expect(screen.queryByRole('article', { busy: true })).toBeNull()
        expect(screen.getAllByRole('article')).toHaveLength(2)
      })
      const [mine, agent] = screen.getAllByRole('article')
      expect(mine).toHaveTextContent('Model a library')
      expect(agent).toHaveTextContent('Here you go:')
      expect(await within(agent).findByRole('link', { name: /domain/i })).toHaveAttribute(
        'href',
        expect.stringMatching(new RegExp(`/projects/${projectId}/diagrams/\\d+$`)),
      )
      expect(await within(agent).findByTestId('mermaid-svg')).toHaveTextContent('class Book')
      const sidebar = screen.getByRole('navigation', { name: /project/i })
      expect(await within(sidebar).findByRole('link', { name: /domain/i })).toBeInTheDocument()
      expect(within(sidebar).getByRole('link', { name: /model a library/i })).toBeInTheDocument()
    })

    it('shows that the agent is working while waiting for the reply', async () => {
      const { projectId, chatSessionId } = await seedChat()
      await seedOllama()
      let answer: (value: Response) => void = () => {}
      const fetch = vi.fn(() => new Promise<Response>((resolve) => (answer = resolve)))
      vi.stubGlobal('fetch', fetch)
      renderAt(`/projects/${projectId}/chats/${chatSessionId}`)

      await userEvent.type(await screen.findByRole('textbox', { name: /message/i }), 'hi{Enter}')

      expect(await screen.findByRole('status')).toHaveTextContent(/thinking/i)
      expect(screen.queryByRole('button', { name: /send/i })).toBeNull()
      expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument()
      // The status shows before the request goes out (the user message is saved first).
      await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
      answer(Response.json({ message: { content: 'hello' } }))
      await vi.waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    })

    it('streams the reply as it is written, then shows the saved message', async () => {
      const { projectId, chatSessionId } = await seedChat()
      await seedOllama()
      const stream = stubOllamaStream()
      renderAt(`/projects/${projectId}/chats/${chatSessionId}`)

      await userEvent.type(await screen.findByRole('textbox', { name: /message/i }), 'hi{Enter}')
      await vi.waitFor(() => expect(stream.requests).toBe(1))
      stream.push({ content: 'Hello, ' })

      const live = await screen.findByRole('article', { busy: true })
      await vi.waitFor(() => expect(live).toHaveTextContent('Hello,'))
      expect(screen.getByRole('status')).toHaveTextContent(/writing/i)

      stream.push({ content: 'world!' }, true)
      stream.close()
      await vi.waitFor(() => expect(screen.queryByRole('article', { busy: true })).toBeNull())
      const articles = screen.getAllByRole('article')
      expect(articles).toHaveLength(2)
      expect(articles[1]).toHaveTextContent('Hello, world!')
    })

    it('does not draw diagrams while the reply is still being written and checked', async () => {
      const { projectId, chatSessionId } = await seedChat()
      await seedOllama()
      const stream = stubOllamaStream()
      renderAt(`/projects/${projectId}/chats/${chatSessionId}`)

      await userEvent.type(await screen.findByRole('textbox', { name: /message/i }), 'hi{Enter}')
      await vi.waitFor(() => expect(stream.requests).toBe(1))
      stream.push({ content: '```mermaid\n---\ntitle: Domain\n---\nclassDiagram\n  class Book\n```\n' })

      const live = await screen.findByRole('article', { busy: true })
      await vi.waitFor(() => expect(live).toHaveTextContent(/domain/i))
      expect(within(live).queryByTestId('mermaid-svg')).toBeNull()

      stream.close()
      await vi.waitFor(() => expect(screen.queryByRole('article', { busy: true })).toBeNull())
      const saved = screen.getAllByRole('article')
      expect(await within(saved[1]).findByTestId('mermaid-svg')).toHaveTextContent('class Book')
    })

    it('shows the agent�s work as it happens and keeps it with the reply', async () => {
      const { projectId, chatSessionId } = await seedChat()
      await db.diagrams.add({ projectId, type: 'class', name: 'Domain model', source: 'classDiagram' })
      await seedOllama()
      const stream = stubOllamaStream()
      renderAt(`/projects/${projectId}/chats/${chatSessionId}`)

      await userEvent.type(await screen.findByRole('textbox', { name: /message/i }), 'hi{Enter}')
      await vi.waitFor(() => expect(stream.requests).toBe(1))
      stream.push(
        { content: '', tool_calls: [{ function: { name: 'read_diagram', arguments: { title: 'Domain model' } } }] },
        true,
      )
      stream.close()

      const live = await screen.findByRole('article', { busy: true })
      expect(await within(live).findByText(/read .domain model./i)).toBeInTheDocument()
      await vi.waitFor(() => expect(stream.requests).toBe(2))
      stream.push({ content: 'It has no classes yet.' }, true)
      stream.close()

      await vi.waitFor(() => expect(screen.queryByRole('article', { busy: true })).toBeNull())
      const [, reply] = screen.getAllByRole('article')
      expect(reply).toHaveTextContent('It has no classes yet.')
      const work = within(reply).getByText(/worked through 1 step/i)
      await userEvent.click(work)
      expect(within(reply).getByText(/read .domain model./i)).toBeVisible()
    })

    it('stops a reply, keeping what was written so far', async () => {
      const { projectId, chatSessionId } = await seedChat()
      await seedOllama()
      const stream = stubOllamaStream()
      renderAt(`/projects/${projectId}/chats/${chatSessionId}`)

      await userEvent.type(await screen.findByRole('textbox', { name: /message/i }), 'hi{Enter}')
      await vi.waitFor(() => expect(stream.requests).toBe(1))
      stream.push({ content: 'Partial answer' })
      await screen.findByText('Partial answer')
      await userEvent.click(await screen.findByRole('button', { name: /stop/i }))

      await vi.waitFor(() => {
        expect(screen.queryByRole('article', { busy: true })).toBeNull()
        expect(screen.getAllByRole('article')).toHaveLength(2)
      })
      const [, stopped] = screen.getAllByRole('article')
      expect(stopped).toHaveTextContent('Partial answer')
      expect(within(stopped).getByText(/stopped/i)).toBeInTheDocument()
      expect(screen.queryByText(/hasn.t replied/i)).toBeNull()
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('stops a reply before anything is written, leaving the message unanswered', async () => {
      const { projectId, chatSessionId } = await seedChat()
      await seedOllama()
      const stream = stubOllamaStream()
      renderAt(`/projects/${projectId}/chats/${chatSessionId}`)

      await userEvent.type(await screen.findByRole('textbox', { name: /message/i }), 'hi{Enter}')
      await vi.waitFor(() => expect(stream.requests).toBe(1))
      await userEvent.click(await screen.findByRole('button', { name: /stop/i }))

      expect(await screen.findByText(/hasn.t replied/i)).toBeInTheDocument()
      expect(screen.getAllByRole('article')).toHaveLength(1)
    })

    it('shows a failed reply with a retry button', async () => {
      const { projectId, chatSessionId } = await seedChat()
      await seedOllama()
      vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
      renderAt(`/projects/${projectId}/chats/${chatSessionId}`)

      await userEvent.type(await screen.findByRole('textbox', { name: /message/i }), 'hi{Enter}')
      expect(await screen.findByRole('alert')).toHaveTextContent(/failed to fetch/i)

      stubOllamaReply('Recovered')
      await userEvent.click(screen.getByRole('button', { name: /retry/i }))
      await vi.waitFor(() => {
        expect(screen.queryByRole('article', { busy: true })).toBeNull()
        expect(screen.getAllByRole('article')).toHaveLength(2)
      })
      expect(screen.getAllByRole('article')[1]).toHaveTextContent('Recovered')
      expect(screen.queryByRole('alert')).toBeNull()
    })

    describe('adding context', () => {
      const pngFile = () => new File([new Uint8Array([137, 80, 78, 71])], 'sketch.png', { type: 'image/png' })
      const textFile = () => new File(['Members borrow books'], 'notes.txt', { type: 'text/plain' })

      it('attaches images and files with the circle button and sends them with the message', async () => {
        const { projectId, chatSessionId } = await seedChat()
        await seedOllama()
        stubOllamaReply('Thanks!')
        renderAt(`/projects/${projectId}/chats/${chatSessionId}`)

        await userEvent.click(await screen.findByRole('button', { name: /add context/i }))
        expect(screen.getByRole('menuitem', { name: /upload images or files/i })).toBeInTheDocument()
        await userEvent.upload(screen.getByLabelText(/attach files/i), [pngFile(), textFile()])

        const pending = await screen.findByRole('list', { name: /attached context/i })
        expect(within(pending).getByRole('img', { name: 'sketch.png' })).toBeInTheDocument()
        expect(within(pending).getByText('notes.txt')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Remove notes.txt' }))
        expect(within(pending).queryByText('notes.txt')).toBeNull()

        await userEvent.type(screen.getByRole('textbox', { name: /message/i }), 'Model this{Enter}')

        const [mine] = await screen.findAllByRole('article')
        expect(within(mine).getByRole('img', { name: 'sketch.png' })).toHaveAttribute(
          'src',
          expect.stringMatching(/^data:image\/png;base64,/),
        )
        await vi.waitFor(() => expect(screen.queryByRole('list', { name: /attached context/i })).toBeNull())
        const [message] = await db.messages.toArray()
        expect(message.parts).toEqual([
          { type: 'text', content: 'Model this' },
          { type: 'attachment', name: 'sketch.png', mediaType: 'image/png', data: 'iVBORw==' },
        ])
      })

      it('opens a sent image full size', async () => {
        const { projectId, chatSessionId } = await seedChat()
        await db.messages.add({
          chatSessionId,
          sender: 'user',
          on: new Date(),
          isSent: true,
          parts: [{ type: 'attachment', name: 'sketch.png', mediaType: 'image/png', data: 'iVBORw==' }],
        })
        renderAt(`/projects/${projectId}/chats/${chatSessionId}`)

        await userEvent.click(await screen.findByRole('button', { name: 'Open sketch.png' }))
        const viewer = screen.getByRole('dialog', { name: 'sketch.png' })
        expect(within(viewer).getByRole('img', { name: 'sketch.png' })).toHaveAttribute('src', 'data:image/png;base64,iVBORw==')
        expect(within(viewer).getByRole('button', { name: /close/i })).toHaveFocus()

        await userEvent.keyboard('{Escape}')
        expect(screen.queryByRole('dialog')).toBeNull()
        expect(screen.getByRole('button', { name: 'Open sketch.png' })).toHaveFocus()
      })

      it('references a project diagram', async () => {
        const { projectId, chatSessionId } = await seedChat()
        const diagramId = await db.diagrams.add({ projectId, type: 'class', name: 'Domain model', source: 'classDiagram' })
        await seedOllama()
        stubOllamaReply('Sure.')
        renderAt(`/projects/${projectId}/chats/${chatSessionId}`)

        await userEvent.click(await screen.findByRole('button', { name: /add context/i }))
        await userEvent.click(await screen.findByRole('menuitem', { name: /domain model/i }))
        expect(screen.queryByRole('menu')).toBeNull()
        const pending = screen.getByRole('list', { name: /attached context/i })
        expect(within(pending).getByText('Domain model')).toBeInTheDocument()

        // A message can be only context.
        await userEvent.click(screen.getByRole('button', { name: /send/i }))

        const [mine] = await screen.findAllByRole('article')
        expect(await within(mine).findByRole('link', { name: /domain model/i })).toHaveAttribute(
          'href',
          `/projects/${projectId}/diagrams/${diagramId}`,
        )
        const [message] = await db.messages.toArray()
        expect(message.parts).toEqual([{ type: 'diagram-reference', diagramId }])
      })

      it('attaches images pasted into the message field', async () => {
        const { projectId, chatSessionId } = await seedChat()
        renderAt(`/projects/${projectId}/chats/${chatSessionId}`)

        await userEvent.click(await screen.findByRole('textbox', { name: /message/i }))
        await userEvent.paste({ files: [pngFile()] } as unknown as DataTransfer)

        const pending = await screen.findByRole('list', { name: /attached context/i })
        expect(within(pending).getByRole('img', { name: 'sketch.png' })).toBeInTheDocument()
      })

      it('explains why a file cannot be attached', async () => {
        const { projectId, chatSessionId } = await seedChat()
        renderAt(`/projects/${projectId}/chats/${chatSessionId}`)
        const user = userEvent.setup({ applyAccept: false })

        const big = new File([new Uint8Array(6 * 1024 * 1024)], 'huge.png', { type: 'image/png' })
        const zip = new File(['PK'], 'code.zip', { type: 'application/zip' })
        await user.upload(await screen.findByLabelText(/attach files/i), [big, zip])

        const alert = await screen.findByRole('alert')
        expect(alert).toHaveTextContent(/huge\.png.*5 MB/i)
        expect(alert).toHaveTextContent(/code\.zip/)
        expect(screen.queryByRole('list', { name: /attached context/i })).toBeNull()
      })
    })

    it('asks for a provider when none is configured', async () => {
      const { projectId, chatSessionId } = await seedChat()
      renderAt(`/projects/${projectId}/chats/${chatSessionId}`)

      expect(await screen.findByRole('link', { name: /add a provider/i })).toHaveAttribute('href', '/settings')
      await userEvent.type(screen.getByRole('textbox', { name: /message/i }), 'hi')
      expect(screen.getByRole('button', { name: /send/i })).toBeDisabled()
    })

    it('lets the user pick the provider for the chat', async () => {
      const { projectId, chatSessionId } = await seedChat()
      await seedOllama()
      const otherId = await db.providers.add({ kind: 'anthropic', name: 'Claude', args: { apiKey: 'k', model: 'claude-opus-5' } })
      renderAt(`/projects/${projectId}/chats/${chatSessionId}`)

      const picker = await screen.findByRole('combobox', { name: /model/i })
      await vi.waitFor(() => expect(within(picker).getAllByRole('option')).toHaveLength(2))
      expect(picker).toHaveDisplayValue(/local · llama3\.2/i)
      await userEvent.selectOptions(picker, String(otherId))

      await vi.waitFor(async () => expect((await db.chatSessions.get(chatSessionId))?.providerId).toBe(otherId))
    })

    it('does not send blank messages', async () => {
      const projectId = await seedProject()
      const chatSessionId = await db.chatSessions.add({ projectId, draft: '', title: 'New chat' })
      renderAt(`/projects/${projectId}/chats/${chatSessionId}`)

      expect(await screen.findByRole('button', { name: /send/i })).toBeDisabled()
      await userEvent.type(screen.getByRole('textbox', { name: /message/i }), '   ')
      expect(screen.getByRole('button', { name: /send/i })).toBeDisabled()
    })
  })

  describe('diagram page', () => {
    const source = 'classDiagram\n  Book <|-- Ebook'

    async function seedDiagram(diagramSource = source) {
      const projectId = await seedProject()
      const diagramId = await db.diagrams.add({ projectId, type: 'class', name: 'Domain', source: diagramSource })
      return { projectId, diagramId }
    }

    it('draws the diagram as SVG under its name', async () => {
      const { projectId, diagramId } = await seedDiagram()
      renderAt(`/projects/${projectId}/diagrams/${diagramId}`)

      const figure = await screen.findByRole('figure', { name: 'Domain' })
      expect(await within(figure).findByTestId('mermaid-svg')).toHaveTextContent('Book <|-- Ebook')
      expect(renderMermaid).toHaveBeenCalledWith(source)
    })

    it('explains when the diagram cannot be drawn and shows its source', async () => {
      vi.mocked(renderMermaid).mockRejectedValueOnce(new Error('Parse error on line 2'))
      const { projectId, diagramId } = await seedDiagram()
      renderAt(`/projects/${projectId}/diagrams/${diagramId}`)

      expect(await screen.findByRole('alert')).toHaveTextContent(/parse error on line 2/i)
      expect(screen.getByText(/Book <\|-- Ebook/)).toBeInTheDocument()
    })

    it('edits the Mermaid source', async () => {
      const { projectId, diagramId } = await seedDiagram()
      renderAt(`/projects/${projectId}/diagrams/${diagramId}`)

      await userEvent.click(await screen.findByRole('button', { name: /edit source/i }))
      const editor = screen.getByRole('textbox', { name: /mermaid source/i })
      expect(editor).toHaveValue(source)
      await userEvent.clear(editor)
      await userEvent.type(editor, 'classDiagram{Enter}  class Loan')
      await userEvent.click(screen.getByRole('button', { name: /save/i }))

      await vi.waitFor(async () =>
        expect((await db.diagrams.get(diagramId))?.source).toBe('classDiagram\n  class Loan'),
      )
      // The editor closes once the write has resolved, a tick after the data changes.
      await vi.waitFor(() => expect(screen.queryByRole('textbox', { name: /mermaid source/i })).toBeNull())
    })

    it('offers the SVG for download', async () => {
      const { projectId, diagramId } = await seedDiagram()
      renderAt(`/projects/${projectId}/diagrams/${diagramId}`)

      const link = await screen.findByRole('link', { name: /download svg/i })
      expect(link).toHaveAttribute('download', 'Domain.svg')
      expect(link.getAttribute('href')).toMatch(/^data:image\/svg\+xml/)
    })

    it('reports a missing diagram', async () => {
      const projectId = await seedProject()
      renderAt(`/projects/${projectId}/diagrams/999`)
      expect(await screen.findByText(/diagram not found/i)).toBeInTheDocument()
    })
  })

  describe('renaming and deleting', () => {
    async function rename(label: RegExp, field: RegExp, value: string) {
      await userEvent.click(await screen.findByRole('button', { name: label }))
      const input = screen.getByRole('textbox', { name: field })
      await userEvent.clear(input)
      await userEvent.type(input, `${value}{Enter}`)
    }

    it('renames the project from the top bar', async () => {
      const projectId = await seedProject()
      renderAt(`/projects/${projectId}`)

      await rename(/rename project/i, /project name/i, 'Library v2')

      await vi.waitFor(async () => expect((await db.projects.get(projectId))?.name).toBe('Library v2'))
      expect(await within(screen.getByRole('banner')).findByText('Library v2')).toBeInTheDocument()
    })

    it('cancels a rename with Escape', async () => {
      const projectId = await seedProject()
      renderAt(`/projects/${projectId}`)

      await userEvent.click(await screen.findByRole('button', { name: /rename project/i }))
      await userEvent.type(screen.getByRole('textbox', { name: /project name/i }), ' changed{Escape}')

      expect(screen.queryByRole('textbox', { name: /project name/i })).toBeNull()
      expect((await db.projects.get(projectId))?.name).toBe('Library system')
    })

    it('deletes the project after confirmation and returns to the projects page', async () => {
      const { projectId } = await seedChat()
      const router = renderAt(`/projects/${projectId}`)

      await userEvent.click(await screen.findByRole('button', { name: /delete project/i }))
      expect(await db.projects.count()).toBe(1)
      await userEvent.click(screen.getByRole('button', { name: /yes, delete/i }))

      await expectPath(router, '/')
      expect(await db.projects.count()).toBe(0)
      expect(await db.chatSessions.count()).toBe(0)
    })

    it('keeps the project when the delete is cancelled', async () => {
      const projectId = await seedProject()
      renderAt(`/projects/${projectId}`)

      await userEvent.click(await screen.findByRole('button', { name: /delete project/i }))
      await userEvent.click(screen.getByRole('button', { name: /cancel/i }))

      expect(screen.queryByRole('button', { name: /yes, delete/i })).toBeNull()
      expect(await db.projects.count()).toBe(1)
    })

    it('renames and deletes a chat', async () => {
      const { projectId, chatSessionId } = await seedChat()
      const router = renderAt(`/projects/${projectId}/chats/${chatSessionId}`)

      await rename(/rename chat/i, /chat title/i, 'Lending')
      const sidebar = screen.getByRole('navigation', { name: /project/i })
      expect(await within(sidebar).findByRole('link', { name: 'Lending' })).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: /delete chat/i }))
      await userEvent.click(screen.getByRole('button', { name: /yes, delete/i }))

      await expectPath(router, `/projects/${projectId}`)
      expect(await db.chatSessions.count()).toBe(0)
    })

    it('renames and deletes a diagram', async () => {
      const projectId = await seedProject()
      const diagramId = await db.diagrams.add({ projectId, type: 'class', name: 'Domain', source: 'classDiagram' })
      const router = renderAt(`/projects/${projectId}/diagrams/${diagramId}`)

      await rename(/rename diagram/i, /diagram name/i, 'Core domain')
      expect(await screen.findByRole('figure', { name: 'Core domain' })).toBeInTheDocument()
      // The agent matches diagrams by Mermaid title, so the source follows the rename.
      expect((await db.diagrams.get(diagramId))?.source).toBe('---\ntitle: Core domain\n---\nclassDiagram')

      await userEvent.click(screen.getByRole('button', { name: /delete diagram/i }))
      await userEvent.click(screen.getByRole('button', { name: /yes, delete/i }))

      await expectPath(router, `/projects/${projectId}`)
      expect(await db.diagrams.count()).toBe(0)
    })
  })
})
