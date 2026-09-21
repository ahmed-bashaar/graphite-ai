/**
 * Turns ASCII-based formats (JSON, XML, Markdown, ...) into browser-native
 * formats (HTML, CSS, SVG). `render()` returns markup that is safe to inject.
 */
export interface Renderable {
  render(): string
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char])
}
