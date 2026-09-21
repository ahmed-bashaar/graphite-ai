import type { AiAgent } from './AiAgent.ts'
import { ChatSession } from './ChatSession.ts'
import { Diagram } from './Diagram.ts'

export class Project {
  name: string
  sessions: ChatSession[] = []
  diagrams: Diagram[] = []

  constructor(name: string) {
    this.name = name
  }

  createSession(agent?: AiAgent): ChatSession {
    const session = new ChatSession(agent)
    this.sessions.push(session)
    return session
  }

  removeSession(session: ChatSession): void {
    session.setAgent(null)
    this.sessions = this.sessions.filter((s) => s !== session)
  }

  createDiagram(type: string, name: string, source?: string): Diagram {
    const diagram = new Diagram(type, name, source)
    this.diagrams.push(diagram)
    return diagram
  }

  removeDiagram(diagram: Diagram): void {
    this.diagrams = this.diagrams.filter((d) => d !== diagram)
  }
}
