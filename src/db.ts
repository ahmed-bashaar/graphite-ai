import { Dexie, type EntityTable } from 'dexie'
import type { AgentStep, Args } from './lib/index.ts'
import type { ProviderKind } from './providers.ts'

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
  /** Shown in the project sidebar; set from the first message sent. */
  title: string
  draft: string
  /** Provider used for replies; unset or deleted means the first configured one. */
  providerId?: number
}

export type MessagePartRecord =
  | { type: 'text'; content: string }
  | { type: 'code'; content: string; language?: string }
  | { type: 'diagram-reference'; diagramId: number }

export interface MessageRecord {
  id: number
  chatSessionId: number
  sender: string
  on: Date
  isSent: boolean
  parts: MessagePartRecord[]
  /** What the agent did before answering (tool calls, checks, ...), for agent messages. */
  steps?: AgentStep[]
}

export interface DiagramRecord {
  id: number
  projectId: number
  type: string
  name: string
  /** ASCII source produced by the LLM (see Diagram in src/lib). */
  source: string
}

/** A configured LLM provider; `args` match its `exposeParameters()`. */
export interface ProviderRecord {
  id: number
  kind: ProviderKind
  name: string
  args: Args
}

export const db = new Dexie('graphite-ai') as Dexie & {
  projects: EntityTable<ProjectRecord, 'id'>
  chatSessions: EntityTable<ChatSessionRecord, 'id'>
  messages: EntityTable<MessageRecord, 'id'>
  diagrams: EntityTable<DiagramRecord, 'id'>
  providers: EntityTable<ProviderRecord, 'id'>
}

// Only primary keys and queried fields are listed; bump the version and add a
// new stores() call when changing them. Non-indexed fields need no bump.
db.version(1).stores({
  projects: '++id, createdAt',
  chatSessions: '++id, projectId',
  messages: '++id, chatSessionId, [chatSessionId+on]',
  diagrams: '++id, projectId',
})
db.version(2).stores({
  providers: '++id',
})
