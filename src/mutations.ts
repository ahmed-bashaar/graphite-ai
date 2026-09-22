import { db, type DiagramRecord, type VersionAuthor } from './db.ts'
import { diagramTypeOf, retitle } from './lib/index.ts'

// Writes that span tables: cascading deletes, and diagram changes that keep
// the version history. Messages that referenced a deleted diagram keep the
// reference; the UI shows it as "Diagram deleted".

export async function deleteProject(projectId: number): Promise<void> {
  await db.transaction('rw', [db.projects, db.chatSessions, db.messages, db.diagrams, db.diagramVersions], async () => {
    const chatIds = await db.chatSessions.where({ projectId }).primaryKeys()
    await db.messages.where('chatSessionId').anyOf(chatIds).delete()
    await db.chatSessions.bulkDelete(chatIds)
    const diagramIds = await db.diagrams.where({ projectId }).primaryKeys()
    await db.diagramVersions.where('diagramId').anyOf(diagramIds).delete()
    await db.diagrams.bulkDelete(diagramIds)
    await db.projects.delete(projectId)
  })
}

export async function deleteChat(chatSessionId: number): Promise<void> {
  await db.transaction('rw', db.chatSessions, db.messages, async () => {
    await db.messages.where({ chatSessionId }).delete()
    await db.chatSessions.delete(chatSessionId)
  })
}

export async function deleteDiagram(diagramId: number): Promise<void> {
  await db.transaction('rw', db.diagrams, db.diagramVersions, async () => {
    await db.diagramVersions.where({ diagramId }).delete()
    await db.diagrams.delete(diagramId)
  })
}

/** Adds a diagram and records its source as the first version. */
export async function createDiagram(diagram: Omit<DiagramRecord, 'id'>, author: VersionAuthor): Promise<number> {
  return db.transaction('rw', db.diagrams, db.diagramVersions, async () => {
    const diagramId = await db.diagrams.add(diagram)
    await db.diagramVersions.add({ diagramId, source: diagram.source, savedAt: new Date(), author })
    return diagramId
  })
}

/**
 * Sets a diagram's source (and the type it implies) and records it as a new
 * version. A diagram from before version history gets its old source recorded
 * first. Saving the same source again does nothing.
 */
export async function updateDiagramSource(
  diagramId: number,
  source: string,
  author: VersionAuthor,
  restoredFrom?: number,
): Promise<void> {
  await db.transaction('rw', db.diagrams, db.diagramVersions, async () => {
    const diagram = await db.diagrams.get(diagramId)
    if (!diagram || diagram.source === source) return
    if ((await db.diagramVersions.where({ diagramId }).count()) === 0) {
      await db.diagramVersions.add({ diagramId, source: diagram.source, savedAt: new Date(0), author: 'earlier' })
    }
    await db.diagrams.update(diagramId, { source, type: diagramTypeOf(source) })
    await db.diagramVersions.add({
      diagramId,
      source,
      savedAt: new Date(),
      author,
      ...(restoredFrom !== undefined && { restoredFrom }),
    })
  })
}

/**
 * Makes an old version current again, as a new version by the user. It keeps
 * the diagram's current name, since the agent finds diagrams by title.
 */
export async function restoreDiagramVersion(versionId: number): Promise<void> {
  await db.transaction('rw', db.diagrams, db.diagramVersions, async () => {
    const version = await db.diagramVersions.get(versionId)
    const diagram = version && (await db.diagrams.get(version.diagramId))
    if (!version || !diagram) return
    await updateDiagramSource(diagram.id, retitle(version.source, diagram.name), 'user', version.id)
  })
}
