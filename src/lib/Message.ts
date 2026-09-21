import type { MessagePart } from './MessagePart.ts'
import type { Renderable } from './Renderable.ts'

export type MessageInit = {
  sender: string
  contents?: MessagePart[]
  on?: Date
  isSent?: boolean
}

export class Message implements Renderable {
  sender: string
  /** When the message was sent (or created, while still a draft). */
  on: Date
  isSent: boolean
  contents: MessagePart[]

  constructor({ sender, contents = [], on = new Date(), isSent = false }: MessageInit) {
    this.sender = sender
    this.contents = contents
    this.on = on
    this.isSent = isSent
  }

  render(): string {
    return this.contents.map((part) => part.render()).join('')
  }
}
