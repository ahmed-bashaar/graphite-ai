import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db.ts'
import { deleteChat, deleteDiagram, deleteProject } from './mutations.ts'

async function seedTwoProjects() {
  const ids = []
  for (const name of ['A', 'B']) {
    const projectId = await db.projects.add({ name, createdAt: new Date() })
    const chatSessionId = await db.chatSessions.add({ projectId, title: `${name} chat`, draft: '' })
    const diagramId = await db.diagrams.add({ projectId, type: 'class', name: `${name} diagram`, source: '' })
    await db.messages.add({
      chatSessionId,
      sender: 'user',
      on: new Date(),
      isSent: true,
      parts: [{ type: 'diagram-reference', diagramId }],
    })
    ids.push({ projectId, chatSessionId, diagramId })
  }
  return ids
}

describe('mutations', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('deleteProject removes the project with its chats, messages and diagrams only', async () => {
    const [a, b] = await seedTwoProjects()

    await deleteProject(a.projectId)

    expect(await db.projects.toArray()).toEqual([expect.objectContaining({ id: b.projectId })])
    expect((await db.chatSessions.toArray()).map((c) => c.id)).toEqual([b.chatSessionId])
    expect((await db.diagrams.toArray()).map((d) => d.id)).toEqual([b.diagramId])
    expect((await db.messages.toArray()).map((m) => m.chatSessionId)).toEqual([b.chatSessionId])
  })

  it('deleteChat removes the chat and its messages but keeps the diagrams', async () => {
    const [a] = await seedTwoProjects()

    await deleteChat(a.chatSessionId)

    expect(await db.chatSessions.get(a.chatSessionId)).toBeUndefined()
    expect(await db.messages.where({ chatSessionId: a.chatSessionId }).count()).toBe(0)
    expect(await db.diagrams.get(a.diagramId)).toBeDefined()
  })

  it('deleteDiagram removes only the diagram', async () => {
    const [a] = await seedTwoProjects()

    await deleteDiagram(a.diagramId)

    expect(await db.diagrams.get(a.diagramId)).toBeUndefined()
    expect(await db.messages.where({ chatSessionId: a.chatSessionId }).count()).toBe(1)
  })
})
