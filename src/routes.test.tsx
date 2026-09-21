import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './db.ts'
import { routes } from './routes.tsx'

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

async function seedProject(name = 'Library system') {
  return db.projects.add({ name, createdAt: new Date() })
}

describe('routes', () => {
  // Reset before (not after) each test so no mounted live query sees a closed db.
  beforeEach(async () => {
    await db.delete()
    await db.open()
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

    it('sends a message, clears the input and titles the chat after it', async () => {
      const projectId = await seedProject()
      const chatSessionId = await db.chatSessions.add({ projectId, draft: '', title: 'New chat' })
      renderAt(`/projects/${projectId}/chats/${chatSessionId}`)

      const input = await screen.findByRole('textbox', { name: /message/i })
      await userEvent.type(input, 'Model a library{Enter}')

      expect(await screen.findByRole('article')).toHaveTextContent('Model a library')
      expect(input).toHaveValue('')
      const [message] = await db.messages.toArray()
      expect(message).toMatchObject({ chatSessionId, sender: 'user', isSent: true })
      expect((await db.chatSessions.get(chatSessionId))?.title).toBe('Model a library')
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
    it('shows the diagram name and source', async () => {
      const projectId = await seedProject()
      const diagramId = await db.diagrams.add({
        projectId, type: 'class', name: 'Domain', source: 'classDiagram\n  Book <|-- Ebook',
      })
      renderAt(`/projects/${projectId}/diagrams/${diagramId}`)

      const figure = await screen.findByRole('figure')
      expect(figure).toHaveTextContent('Domain')
      expect(figure).toHaveTextContent('Book <|-- Ebook')
    })
  })
})

function expectPath(router: ReturnType<typeof createMemoryRouter>, path: string) {
  // Navigation follows an async Dexie write, so poll for it.
  return vi.waitFor(() => expect(router.state.location.pathname).toBe(path))
}
