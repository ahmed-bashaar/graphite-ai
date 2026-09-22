import type { AgentProgress } from '../lib/index.ts'

// Replies in progress, by chat id. They live outside React so a reply keeps
// streaming (and stays stoppable) when the user leaves the chat and comes back.

type Reply = { progress: AgentProgress; controller: AbortController }

const replies = new Map<number, Reply>()
const listeners = new Set<() => void>()

const notify = () => listeners.forEach((listener) => listener())

/** The reply being written in this chat, if any. */
export function replyProgress(chatSessionId: number): AgentProgress | undefined {
  return replies.get(chatSessionId)?.progress
}

/** Calls `listener` whenever any reply starts, progresses or ends. */
export function subscribeToReplies(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Stops the reply being written in this chat; nothing is saved. */
export function stopReply(chatSessionId: number): void {
  replies.get(chatSessionId)?.controller.abort()
}

/** Registers a new reply, or returns null if the chat already has one in progress. */
export function startReply(chatSessionId: number): AbortController | null {
  if (replies.has(chatSessionId)) return null
  const controller = new AbortController()
  replies.set(chatSessionId, { progress: { steps: [], draft: '' }, controller })
  notify()
  return controller
}

export function updateReply(chatSessionId: number, progress: AgentProgress): void {
  const reply = replies.get(chatSessionId)
  if (!reply) return
  reply.progress = progress
  notify()
}

export function endReply(chatSessionId: number): void {
  if (replies.delete(chatSessionId)) notify()
}
