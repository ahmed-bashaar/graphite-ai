export type DiagramType = 'class' | 'sequence' | 'state' | 'er' | 'activity' | 'mermaid'

export type ReplySegment =
  | { kind: 'text'; content: string }
  | { kind: 'code'; content: string; language: string }
  | { kind: 'diagram'; name: string; type: DiagramType; source: string }

const DEFAULT_NAMES: Record<DiagramType, string> = {
  class: 'Class diagram',
  sequence: 'Sequence diagram',
  state: 'State diagram',
  er: 'ER diagram',
  activity: 'Activity diagram',
  mermaid: 'Diagram',
}

/** Human-readable name of a stored diagram type ("Class diagram", ...). */
export function diagramTypeLabel(type: string): string {
  return Object.hasOwn(DEFAULT_NAMES, type) ? DEFAULT_NAMES[type as DiagramType] : DEFAULT_NAMES.mermaid
}

const OPENING_FENCE = /^ {0,3}```\s*([\w+-]*)\s*$/
const CLOSING_FENCE = /^ {0,3}```\s*$/

/**
 * Splits an LLM reply (Markdown) into text, fenced code, and diagrams.
 * A ```mermaid block is a diagram, named by its frontmatter `title:`.
 */
export function parseReply(reply: string): ReplySegment[] {
  const segments: ReplySegment[] = []
  const lines = reply.replace(/\r\n?/g, '\n').split('\n')
  let text: string[] = []

  const flushText = () => {
    const content = text.join('\n').trim()
    if (content) segments.push({ kind: 'text', content })
    text = []
  }

  for (let i = 0; i < lines.length; i++) {
    const opening = OPENING_FENCE.exec(lines[i])
    if (!opening) {
      text.push(lines[i])
      continue
    }
    flushText()
    const body: string[] = []
    for (i++; i < lines.length && !CLOSING_FENCE.test(lines[i]); i++) body.push(lines[i])
    const content = body.join('\n')
    const language = opening[1].toLowerCase()
    if (language === 'mermaid') {
      const type = diagramTypeOf(content)
      segments.push({ kind: 'diagram', name: titleOf(content) ?? DEFAULT_NAMES[type], type, source: content })
    } else {
      segments.push({ kind: 'code', content, language })
    }
  }
  flushText()
  return segments
}

/** The UML diagram type of Mermaid `source`, from its header keyword. */
export function diagramTypeOf(source: string): DiagramType {
  const header = bodyLines(source).find((line) => line && !line.startsWith('%%')) ?? ''
  const keyword = header.split(/\s+/)[0]
  if (keyword === 'classDiagram') return 'class'
  if (keyword === 'sequenceDiagram') return 'sequence'
  if (keyword.startsWith('stateDiagram')) return 'state'
  if (keyword === 'erDiagram') return 'er'
  if (keyword === 'flowchart' || keyword === 'graph') return 'activity'
  return 'mermaid'
}

function titleOf(source: string): string | undefined {
  const frontmatter = splitFrontmatter(source).frontmatter
  const match = frontmatter.map((line) => /^title:\s*(.+)$/.exec(line)).find(Boolean)
  return match?.[1].trim().replace(/^(["'])(.*)\1$/, '$2') || undefined
}

function bodyLines(source: string): string[] {
  return splitFrontmatter(source).body.map((line) => line.trim())
}

// Mermaid frontmatter: a leading `---` line, YAML, then a closing `---` line.
function splitFrontmatter(source: string): { frontmatter: string[]; body: string[] } {
  const lines = source.split('\n')
  if (lines[0]?.trim() !== '---') return { frontmatter: [], body: lines }
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---')
  if (end === -1) return { frontmatter: [], body: lines }
  return { frontmatter: lines.slice(1, end).map((line) => line.trim()), body: lines.slice(end + 1) }
}
