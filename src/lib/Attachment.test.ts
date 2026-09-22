import { describe, expect, it } from 'vitest'
import { Attachment, attachmentKind, toBase64 } from './Attachment.ts'

describe('attachmentKind', () => {
  it.each([
    ['image/png', 'a.png', 'image'],
    ['image/jpeg', 'a.jpg', 'image'],
    ['image/webp', 'a.webp', 'image'],
    ['application/pdf', 'spec.pdf', 'pdf'],
    ['text/markdown', 'notes.md', 'text'],
    ['application/json', 'data.json', 'text'],
    ['', 'model.puml', 'text'],
    ['', 'schema.mmd', 'text'],
    ['application/octet-stream', 'Main.java', 'text'],
  ])('%s %s is %s', (mediaType, name, kind) => {
    expect(attachmentKind(mediaType, name)).toBe(kind)
  })

  it.each([
    ['image/svg+xml', 'logo.svg'],
    ['image/tiff', 'scan.tiff'],
    ['application/zip', 'code.zip'],
    ['', 'binary'],
  ])('does not accept %s %s', (mediaType, name) => {
    expect(attachmentKind(mediaType, name)).toBeNull()
  })
})

describe('Attachment', () => {
  it('is a message part named after the file', () => {
    const file = new Attachment({ name: 'notes.md', mediaType: 'text/markdown', data: toBase64('# Hi') })
    expect(file.type).toBe('attachment')
    expect(file.content).toBe('notes.md')
    expect(file.kind).toBe('text')
  })

  it('decodes text files as UTF-8', () => {
    const file = new Attachment({ name: 'notes.md', mediaType: 'text/markdown', data: toBase64('Café ☕') })
    expect(file.text()).toBe('Café ☕')
  })

  it('renders images as an inline image and other files by name, escaped', () => {
    const image = new Attachment({ name: '<b>.png', mediaType: 'image/png', data: 'iVBORw0KGgo=' })
    expect(image.render()).toBe('<img src="data:image/png;base64,iVBORw0KGgo=" alt="&lt;b&gt;.png">')
    const pdf = new Attachment({ name: 'a"b.pdf', mediaType: 'application/pdf', data: 'JVBERi0=' })
    expect(pdf.render()).toBe('<span class="attachment">a&quot;b.pdf</span>')
  })

  it('refuses files it cannot use, and image data that is not base64', () => {
    expect(() => new Attachment({ name: 'x.zip', mediaType: 'application/zip', data: '' })).toThrow(/x\.zip/)
    expect(() => new Attachment({ name: 'x.png', mediaType: 'image/png', data: '"><script>' })).toThrow(/base64/)
  })
})
