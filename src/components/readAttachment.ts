import type { ContextPart } from '../agent/conversation.ts'
import { attachmentKind } from '../lib/index.ts'

/** Largest file a message can carry; also Anthropic's limit for a single image. */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024

export type AttachmentPart = Extract<ContextPart, { type: 'attachment' }>

/**
 * Reads `file` as an attachment for the next message, or throws an Error that
 * explains (naming the file) why it can't be attached.
 */
export async function readAttachment(file: File): Promise<AttachmentPart> {
  const kind = attachmentKind(file.type, file.name)
  if (!kind) {
    throw new Error(`"${file.name}" can't be attached: use an image (PNG, JPEG, GIF, WebP), a PDF or a text file.`)
  }
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(`"${file.name}" is larger than 5 MB.`)
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error(`"${file.name}" couldn't be read.`))
    reader.readAsDataURL(file)
  })
  // Browsers often give source files no media type; the extension already said it's text.
  const mediaType = file.type || (kind === 'text' ? 'text/plain' : file.type)
  return { type: 'attachment', name: file.name, mediaType, data: dataUrl.slice(dataUrl.indexOf(',') + 1) }
}
