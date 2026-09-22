import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db.ts'
import {
  createDiagram,
  deleteChat,
  deleteDiagram,
  deleteProject,
  restoreDiagramVersion,
  updateDiagramSource,
} from './mutations.ts'

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

  describe('diagram versions', () => {
    const versions = (diagramId: number) => db.diagramVersions.where({ diagramId }).sortBy('id')

    async function newDiagram() {
      const projectId = await db.projects.add({ name: 'P', createdAt: new Date() })
      const diagramId = await createDiagram(
        { projectId, type: 'class', name: 'Domain', source: '---\ntitle: Domain\n---\nclassDiagram\n  class Book' },
        'agent',
      )
      return { projectId, diagramId }
    }

    it('records the first version when a diagram is created', async () => {
      const { diagramId } = await newDiagram()
      expect(await versions(diagramId)).toEqual([
        expect.objectContaining({ diagramId, author: 'agent', source: expect.stringContaining('class Book') }),
      ])
    })

    it('records a version for each change of source, and none when it is unchanged', async () => {
      const { diagramId } = await newDiagram()
      const v2 = '---\ntitle: Domain\n---\nclassDiagram\n  class Book\n  class Loan'

      await updateDiagramSource(diagramId, v2, 'user')
      await updateDiagramSource(diagramId, v2, 'user')

      expect((await versions(diagramId)).map((v) => [v.author, v.source])).toEqual([
        ['agent', expect.stringContaining('class Book')],
        ['user', v2],
      ])
      expect((await db.diagrams.get(diagramId))?.source).toBe(v2)
    })

    it('keeps the source of a diagram from before version history as its first version', async () => {
      const projectId = await db.projects.add({ name: 'P', createdAt: new Date() })
      const diagramId = await db.diagrams.add({ projectId, type: 'class', name: 'Old', source: 'classDiagram\n  class Old' })

      await updateDiagramSource(diagramId, 'classDiagram\n  class New', 'agent')

      expect((await versions(diagramId)).map((v) => [v.author, v.source])).toEqual([
        ['earlier', 'classDiagram\n  class Old'],
        ['agent', 'classDiagram\n  class New'],
      ])
    })

    it('restores an old version as a new one, under the diagram’s current name and type', async () => {
      const { diagramId } = await newDiagram()
      await updateDiagramSource(diagramId, '---\ntitle: Domain\n---\nsequenceDiagram\n  A->>B: hi', 'agent')
      await db.diagrams.update(diagramId, { name: 'Renamed' })
      const [first] = await versions(diagramId)

      await restoreDiagramVersion(first.id)

      const diagram = await db.diagrams.get(diagramId)
      expect(diagram).toMatchObject({ type: 'class', source: '---\ntitle: Renamed\n---\nclassDiagram\n  class Book' })
      const all = await versions(diagramId)
      expect(all).toHaveLength(3)
      expect(all[2]).toMatchObject({ author: 'user', restoredFrom: first.id, source: diagram?.source })
    })

    it('deletes a diagram’s versions with it, and with its project', async () => {
      const a = await newDiagram()
      const b = await newDiagram()

      await deleteDiagram(a.diagramId)
      await deleteProject(b.projectId)

      expect(await db.diagramVersions.count()).toBe(0)
    })
  })
})
