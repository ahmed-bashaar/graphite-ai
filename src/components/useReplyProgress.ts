import { useSyncExternalStore } from 'react'
import { replyProgress, subscribeToReplies } from '../agent/replies.ts'
import type { AgentProgress } from '../lib/index.ts'

/** The reply GraphiteAI is writing in this chat, re-rendering as it streams; undefined when idle. */
export function useReplyProgress(chatSessionId: number): AgentProgress | undefined {
  return useSyncExternalStore(subscribeToReplies, () => replyProgress(chatSessionId))
}
