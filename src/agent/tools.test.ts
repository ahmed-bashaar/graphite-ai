import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { validateMermaid } from '../components/renderMermaid.ts'
import { db } from '../db.ts'
import { checkDiagrams, diagramTools } from './tools.ts'

const mermaid = (title: string, body: string) => `\`\`\`mermaid\n---\ntitle: ${title}\n---\n${body}\n\`\`\``

async function toolsFor() {
  const projectId = await db.projects.add({ name: 'Library', createdAt: new Date() })
  await db.diagrams.add({ projectId, type: 'class', name: 'Domain model', source: 'classDiagram\n  class Book' })
  const otherProject = await db.projects.add({ name: 'Other', createdAt: new Date() })
  await db.diagrams.add({ projectId: otherProject, type: 'er', name: 'Elsewhere', source: 'erDiagram' })
  const tools = diagramTools(projectId)
  return (name: string) => tools.find((t) => t.name === name)!
}

describe('GraphiteAI tools', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterEach(() => {
    vi.mocked(validateMermaid).mockReset().mockResolvedValue(null)
  })

  it('check_diagram reports whether Mermaid can draw the source, with its error message', async () => {
    const tool = (await toolsFor())('check_diagram')
    vi.mocked(validateMermaid).mockResolvedValueOnce(null).mockResolvedValueOnce('Parse error on line 2')

    await expect(tool.call({ source: 'classDiagram' })).resolves.toMatch(/valid/i)
    await expect(tool.call({ source: 'classDiagram\n  A --> ' })).rejects.toThrow('Parse error on line 2')
    expect(validateMermaid).toHaveBeenLastCalledWith('classDiagram\n  A --> ')
  })

  it('list_diagrams lists the project’s diagrams only', async () => {
    const tool = (await toolsFor())('list_diagrams')
    const listing = await tool.call({})
    expect(listing).toContain('Domain model (Class diagram)')
    expect(listing).not.toContain('Elsewhere')
  })

  it('read_diagram returns a diagram’s source by title, ignoring case', async () => {
    const tool = (await toolsFor())('read_diagram')
    await expect(tool.call({ title: 'domain MODEL' })).resolves.toContain('class Book')
    await expect(tool.call({ title: 'Elsewhere' })).rejects.toThrow(/no diagram/i)
  })
})

describe('checkDiagrams', () => {
  afterEach(() => {
    vi.mocked(validateMermaid).mockReset().mockResolvedValue(null)
  })

  it('accepts an answer whose diagrams all render', async () => {
    await expect(checkDiagrams(`Here:\n\n${mermaid('A', 'classDiagram')}`)).resolves.toBeNull()
  })

  it('names each broken diagram and its Mermaid error', async () => {
    vi.mocked(validateMermaid).mockImplementation(async (source) => (source.includes('-->') ? 'Bad arrow' : null))
    const feedback = await checkDiagrams(
      `${mermaid('Fine', 'classDiagram')}\n\n${mermaid('Broken', 'classDiagram\n  A -->')}`,
    )
    expect(feedback).toContain('"Broken": Bad arrow')
    expect(feedback).not.toContain('"Fine"')
    expect(feedback).toMatch(/not shown to the user/i)
  })
})
