import { describe, expect, it } from 'vitest'
import { AiAgent } from './AiAgent.ts'
import { LlmModel } from './LlmModel.ts'
import type { MessagePart } from './MessagePart.ts'
import { Project } from './Project.ts'

class SilentModel extends LlmModel {
  async complete(): Promise<MessagePart[]> {
    return []
  }
}

describe('Project', () => {
  it('creates and removes sessions', () => {
    const project = new Project('demo')
    const a = project.createSession()
    const b = project.createSession()

    project.removeSession(a)

    expect(project.sessions).toEqual([b])
  })

  it('attaches the given agent to a new session and detaches it on removal', () => {
    const project = new Project('demo')
    const agent = new AiAgent('bot', new SilentModel('m'))
    const session = project.createSession(agent)

    expect(session.agent).toBe(agent)
    project.removeSession(session)
    expect(session.agent).toBeNull()
  })

  it('creates and removes diagrams', () => {
    const project = new Project('demo')
    const diagram = project.createDiagram('mermaid', 'Flow', 'A-->B')

    expect(project.diagrams).toEqual([diagram])
    expect(diagram.source).toBe('A-->B')
    project.removeDiagram(diagram)
    expect(project.diagrams).toEqual([])
  })
})
