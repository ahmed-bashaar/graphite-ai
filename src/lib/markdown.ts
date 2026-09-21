import { escapeHtml } from './Renderable.ts'

/**
 * Renders the Markdown subset LLM replies use (paragraphs, headings, lists,
 * blockquotes, rules, tables, emphasis, inline code, http(s)/mailto links) to
 * HTML. All text is escaped first; only tags generated here reach the output.
 * Fenced code blocks are handled earlier, by `parseReply`.
 */
export function renderMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  let html = ''
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      const level = Math.min(heading[1].length + 2, 6)
      html += `<h${level}>${inline(heading[2].trim())}</h${level}>`
      i++
    } else if (RULE.test(line)) {
      html += '<hr>'
      i++
    } else if (QUOTE.test(line)) {
      const quoted: string[] = []
      for (; i < lines.length && QUOTE.test(lines[i]); i++) quoted.push(lines[i].replace(QUOTE, ''))
      html += `<blockquote>${renderMarkdown(quoted.join('\n'))}</blockquote>`
    } else if (line.includes('|') && TABLE_SEPARATOR.test(lines[i + 1] ?? '')) {
      const header = cells(line)
      const rows: string[][] = []
      for (i += 2; i < lines.length && lines[i].includes('|') && lines[i].trim(); i++) rows.push(cells(lines[i]))
      html +=
        `<table><thead><tr>${header.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>` +
        `<tbody>${rows.map((row) => `<tr>${row.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    } else if (listItem(line)) {
      const { ordered } = listItem(line)!
      const items: string[] = []
      for (; i < lines.length && lines[i].trim(); i++) {
        const item = listItem(lines[i])
        if (item && item.ordered !== ordered) break
        if (item) items.push(item.text)
        else items[items.length - 1] += ` ${lines[i].trim()}` // wrapped item text
      }
      const tag = ordered ? 'ol' : 'ul'
      html += `<${tag}>${items.map((item) => `<li>${inline(item)}</li>`).join('')}</${tag}>`
    } else {
      const paragraph: string[] = []
      for (; i < lines.length && lines[i].trim() && !startsBlock(lines, i); i++) paragraph.push(lines[i].trim())
      html += `<p>${paragraph.map(inline).join('<br>')}</p>`
    }
  }
  return html
}

const HEADING = /^\s{0,3}(#{1,6})\s+(.*)$/
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/
const QUOTE = /^\s{0,3}>\s?/
const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/
const BULLET = /^\s*[-*+]\s+(.*)$/
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/

function listItem(line: string): { ordered: boolean; text: string } | undefined {
  const bullet = BULLET.exec(line)
  if (bullet && !RULE.test(line)) return { ordered: false, text: bullet[1] }
  const numbered = NUMBERED.exec(line)
  return numbered ? { ordered: true, text: numbered[1] } : undefined
}

function startsBlock(lines: string[], i: number): boolean {
  const line = lines[i]
  return (
    HEADING.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    listItem(line) !== undefined ||
    (line.includes('|') && TABLE_SEPARATOR.test(lines[i + 1] ?? ''))
  )
}

function cells(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

/** Inline formatting; `code spans` are escaped but otherwise left untouched. */
function inline(text: string): string {
  return text
    .split(/(`[^`]+`)/)
    .map((chunk, i) => (i % 2 ? `<code>${escapeHtml(chunk.slice(1, -1))}</code>` : format(escapeHtml(chunk))))
    .join('')
}

function format(escaped: string): string {
  return escaped
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, url: string) =>
      /^(https?:|mailto:)/i.test(url) ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>` : match,
    )
    .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, '<strong>$2</strong>')
    .replace(/(^|[^\w*])\*(?=\S)(.+?)(?<=\S)\*(?![\w*])/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_(?=\S)(.+?)(?<=\S)_(?!\w)/g, '$1<em>$2</em>')
}
