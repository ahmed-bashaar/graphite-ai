import { describe, expect, it } from 'vitest'
import { diagramTypeLabel, diagramTypeOf, parseReply, retitle } from './parseReply.ts'

const titled = (title: string, body: string) => `---\ntitle: ${title}\n---\n${body}`

describe('parseReply', () => {
  it('returns plain text as a single text segment', () => {
    expect(parseReply('Hello there.')).toEqual([{ kind: 'text', content: 'Hello there.' }])
  })

  it('splits out mermaid blocks as named diagrams', () => {
    const source = titled('Library domain', 'classDiagram\n  class Book')
    const reply = `Here is the model:\n\n\`\`\`mermaid\n${source}\n\`\`\`\n\nWant changes?`

    expect(parseReply(reply)).toEqual([
      { kind: 'text', content: 'Here is the model:' },
      { kind: 'diagram', name: 'Library domain', type: 'class', source },
      { kind: 'text', content: 'Want changes?' },
    ])
  })

  it('names untitled diagrams after their type', () => {
    const [segment] = parseReply('```mermaid\nsequenceDiagram\n  A->>B: hi\n```')
    expect(segment).toMatchObject({ kind: 'diagram', name: 'Sequence diagram', type: 'sequence' })
  })

  it('keeps other fenced blocks as code', () => {
    expect(parseReply('```ts\nconst a = 1\n```')).toEqual([{ kind: 'code', content: 'const a = 1', language: 'ts' }])
  })

  it('tolerates CRLF line endings and an unterminated final block', () => {
    const segments = parseReply('Intro\r\n```mermaid\r\nerDiagram\r\n  A ||--o{ B : has')
    expect(segments).toEqual([
      { kind: 'text', content: 'Intro' },
      { kind: 'diagram', name: 'ER diagram', type: 'er', source: 'erDiagram\n  A ||--o{ B : has' },
    ])
  })
})

describe('diagramTypeOf', () => {
  it.each([
    ['classDiagram', 'class'],
    ['sequenceDiagram', 'sequence'],
    ['stateDiagram-v2', 'state'],
    ['erDiagram', 'er'],
    ['flowchart TD', 'activity'],
    ['graph LR', 'activity'],
    ['mindmap', 'mermaid'],
  ])('%s is a %s diagram', (header, type) => {
    expect(diagramTypeOf(titled('X', `%% comment\n${header}\n  a`))).toBe(type)
  })
})

describe('retitle', () => {
  it('replaces the frontmatter title', () => {
    expect(retitle('---\ntitle: Old\n---\nclassDiagram', 'New')).toBe('---\ntitle: New\n---\nclassDiagram')
  })

  it('adds a title to frontmatter that has none', () => {
    expect(retitle('---\nconfig:\n  look: handDrawn\n---\nclassDiagram', 'New')).toBe(
      '---\ntitle: New\nconfig:\n  look: handDrawn\n---\nclassDiagram',
    )
  })

  it('adds frontmatter when there is none', () => {
    expect(retitle('classDiagram', 'New')).toBe('---\ntitle: New\n---\nclassDiagram')
  })

  it('keeps the new title parseable', () => {
    const source = retitle('classDiagram', 'Loans: v2')
    expect(parseReply('```mermaid\n' + source + '\n```')[0]).toMatchObject({ name: 'Loans: v2' })
  })
})

describe('diagramTypeLabel', () => {
  it('names known types and falls back for anything else', () => {
    expect(diagramTypeLabel('class')).toBe('Class diagram')
    expect(diagramTypeLabel('er')).toBe('ER diagram')
    expect(diagramTypeLabel('mermaid')).toBe('Diagram')
    expect(diagramTypeLabel('something-new')).toBe('Diagram')
  })
})
