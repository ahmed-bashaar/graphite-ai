import { Dexie, type EntityTable } from 'dexie'

// Persisted shapes for the domain model in docs/uml/. MessageParts are
// composed by their Message, so they are stored inline rather than in a table.

export interface ProjectRecord {
  id: number
  name: string
  createdAt: Date
}

export interface ChatSessionRecord {
  id: number
  projectId: number
  draft: string
}

export type MessagePartRecord =
  | { type: 'text'; content: string }
  | { type: 'diagram-reference'; diagramId: number }

export interface MessageRecord {
  id: number
  chatSessionId: number
  sender: string
  on: Date
  isSent: boolean
  parts: MessagePartRecord[]
}

export interface DiagramRecord {
  id: number
  projectId: number
  content: string
}

export const db = new Dexie('graphite-ai') as Dexie & {
  projects: EntityTable<ProjectRecord, 'id'>
  chatSessions: EntityTable<ChatSessionRecord, 'id'>
  messages: EntityTable<MessageRecord, 'id'>
  diagrams: EntityTable<DiagramRecord, 'id'>
}

// Only primary keys and queried fields are listed; bump the version and add a
// new stores() call when changing the schema.
db.version(1).stores({
  projects: '++id, createdAt',
  chatSessions: '++id, projectId',
  messages: '++id, chatSessionId, [chatSessionId+on]',
  diagrams: '++id, projectId',
})
