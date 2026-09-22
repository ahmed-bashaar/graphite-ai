import { MessagePart } from './MessagePart.ts'
import { escapeHtml } from './Renderable.ts'

/**
 * How a model gets an attachment: images and PDFs as native input, text files
 * as their content.
 */
export type AttachmentKind = 'image' | 'pdf' | 'text'

/** Image formats every supported provider accepts. */
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

// Browsers often report no (or a generic) media type for source files, so the extension decides.
const TEXT_EXTENSIONS = new Set(
  (
    'txt md markdown json csv tsv xml yaml yml toml ini log mmd mermaid puml plantuml dot gv sql graphql ' +
    'js jsx ts tsx mjs cjs py java kt kts scala cs go rb php swift c h cpp hpp rs html css scss sh ps1 bat'
  ).split(' '),
)
const TEXT_TYPES = new Set(['application/json', 'application/xml', 'application/yaml', 'application/x-yaml', 'application/sql'])

/** The kind of file this is, or null if it can't be attached. */
export function attachmentKind(mediaType: string, name: string): AttachmentKind | null {
  if (IMAGE_TYPES.includes(mediaType)) return 'image'
  if (mediaType === 'application/pdf') return 'pdf'
  if (mediaType.startsWith('image/')) return null
  if (mediaType.startsWith('text/') || TEXT_TYPES.has(mediaType)) return 'text'
  const extension = /\.([^./]+)$/.exec(name)?.[1]?.toLowerCase()
  return extension && TEXT_EXTENSIONS.has(extension) ? 'text' : null
}

export type AttachmentInit = { name: string; mediaType: string; data: string }

/** A file the user attached to a message: an image, a PDF or a text file. */
export class Attachment extends MessagePart {
  name: string
  mediaType: string
  /** The file's bytes, base64-encoded. */
  data: string
  kind: AttachmentKind

  constructor({ name, mediaType, data }: AttachmentInit) {
    super('attachment', name)
    const kind = attachmentKind(mediaType, name)
    if (!kind) throw new Error(`"${name}" can't be attached: use an image (PNG, JPEG, GIF, WebP), a PDF or a text file.`)
    // Image data goes into a data: URL, so it must be plain base64.
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data)) throw new Error(`"${name}" isn't valid base64 data.`)
    this.name = name
    this.mediaType = mediaType
    this.data = data
    this.kind = kind
  }

  /** The content of a text file. */
  text(): string {
    return new TextDecoder().decode(Uint8Array.from(atob(this.data), (char) => char.charCodeAt(0)))
  }

  render(): string {
    if (this.kind === 'image') {
      return `<img src="data:${this.mediaType};base64,${this.data}" alt="${escapeHtml(this.name)}">`
    }
    return `<span class="attachment">${escapeHtml(this.name)}</span>`
  }
}

/** `text` as UTF-8, base64-encoded. */
export function toBase64(text: string): string {
  return btoa(Array.from(new TextEncoder().encode(text), (byte) => String.fromCharCode(byte)).join(''))
}
