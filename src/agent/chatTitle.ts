/** Title of a chat session until its first message names it. */
export const NEW_CHAT_TITLE = 'New chat'

/** First line of `text`, shortened to fit the sidebar. */
export function titleFrom(text: string, max = 48): string {
  const line = text.trim().split('\n')[0]
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}
