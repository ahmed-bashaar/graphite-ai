/**
 * Splits text into pieces the size of model tokens: words of up to five
 * letters (longer ones are cut), each with the space before it, and runs of
 * punctuation. Joined, the pieces give back the text.
 */
export function streamTokens(text: string): string[] {
  return text.match(/\s*(?:[\p{L}\p{N}]{1,5}|[^\p{L}\p{N}\s]+)|\s+$/gu) ?? []
}
