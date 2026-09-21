import { afterEach, describe, expect, it } from 'vitest'
import { db } from './db.ts'

describe('db', () => {
  afterEach(async () => {
    await db.delete()
    await db.open()
  })

  it('stores messages and queries them by chat session', async () => {
    const projectId = await db.projects.add({ name: 'Demo', createdAt: new Date() })
    const chatSessionId = await db.chatSessions.add({ projectId, draft: '' })
    await db.messages.add({
      chatSessionId,
      sender: 'user',
      on: new Date(),
      isSent: true,
      parts: [{ type: 'text', content: 'hello' }],
    })

    const messages = await db.messages.where({ chatSessionId }).toArray()
    expect(messages).toHaveLength(1)
    expect(messages[0].parts[0]).toEqual({ type: 'text', content: 'hello' })
  })
})
