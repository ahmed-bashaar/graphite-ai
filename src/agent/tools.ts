import { validateMermaid } from '../components/renderMermaid.ts'
import { db } from '../db.ts'
import { AgenticTool, diagramTypeLabel, diagramTypeOf, parseReply } from '../lib/index.ts'

/** The tools GraphiteAI works with while preparing a reply in `projectId`. */
export function diagramTools(projectId: number): AgenticTool[] {
  const projectDiagrams = () => db.diagrams.where({ projectId }).toArray()
  return [
    new AgenticTool({
      name: 'check_diagram',
      description:
        'Renders Mermaid source the way the user will see it and reports any error. Use it on each diagram before putting it in your reply.',
      parameters: [{ name: 'source', type: 'string', required: true, description: 'The Mermaid source, without the ``` fence.' }],
      handler: async ({ source }) => {
        const error = await validateMermaid(String(source))
        if (error) throw new Error(`Mermaid error: ${error}`)
        return `Valid: Mermaid draws this ${diagramTypeLabel(diagramTypeOf(String(source))).toLowerCase()}.`
      },
    }),
    new AgenticTool({
      name: 'list_diagrams',
      description: 'Lists the titles and types of the diagrams saved in this project, including ones from other chats.',
      handler: async () => {
        const diagrams = await projectDiagrams()
        if (diagrams.length === 0) return 'The project has no diagrams yet.'
        return diagrams.map((d) => `- ${d.name} (${diagramTypeLabel(d.type)})`).join('\n')
      },
    }),
    new AgenticTool({
      name: 'read_diagram',
      description: 'Returns the current Mermaid source of a saved project diagram.',
      parameters: [{ name: 'title', type: 'string', required: true, description: 'The diagram title.' }],
      handler: async ({ title }) => {
        const diagrams = await projectDiagrams()
        const diagram = diagrams.find((d) => sameName(d.name, String(title)))
        if (!diagram) throw new Error(`No diagram titled "${String(title)}". Use list_diagrams to see the titles.`)
        return diagram.source
      },
    }),
  ]
}

/**
 * Checks every diagram in a finished answer with Mermaid. Returns feedback for
 * the agent naming each diagram that fails, or null if they all draw.
 */
export async function checkDiagrams(answer: string): Promise<string | null> {
  const failures: string[] = []
  for (const segment of parseReply(answer)) {
    if (segment.kind !== 'diagram') continue
    const error = await validateMermaid(segment.source)
    if (error) failures.push(`- "${segment.name}": ${error}`)
  }
  if (failures.length === 0) return null
  return [
    'Automatic check: your reply was not shown to the user because Mermaid could not draw these diagrams:',
    ...failures,
    'Fix them (check_diagram can confirm a fix) and write your whole reply again.',
  ].join('\n')
}

export const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
