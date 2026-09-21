import { db } from './db.ts'

// Deletes that must cascade across tables. Messages that referenced a deleted
// diagram keep the reference; the UI shows it as "Diagram deleted".

export async function deleteProject(projectId: number): Promise<void> {
  await db.transaction('rw', db.projects, db.chatSessions, db.messages, db.diagrams, async () => {
    const chatIds = await db.chatSessions.where({ projectId }).primaryKeys()
    await db.messages.where('chatSessionId').anyOf(chatIds).delete()
    await db.chatSessions.bulkDelete(chatIds)
    await db.diagrams.where({ projectId }).delete()
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
  await db.diagrams.delete(diagramId)
}
