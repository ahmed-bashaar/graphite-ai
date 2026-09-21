import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './markdown.ts'

describe('renderMarkdown', () => {
  it('escapes HTML everywhere', () => {
    expect(renderMarkdown('<script>alert(1)</script> **<b>x</b>**')).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt; <strong>&lt;b&gt;x&lt;/b&gt;</strong></p>',
    )
  })

  it('splits paragraphs on blank lines and keeps single line breaks', () => {
    expect(renderMarkdown('one\ntwo\n\nthree')).toBe('<p>one<br>two</p><p>three</p>')
  })

  it('renders emphasis, strong and inline code, leaving code contents alone', () => {
    expect(renderMarkdown('**bold** *it* _it_ `a **b** <c>`')).toBe(
      '<p><strong>bold</strong> <em>it</em> <em>it</em> <code>a **b** &lt;c&gt;</code></p>',
    )
  })

  it('does not treat snake_case or 2 * 3 * 4 as emphasis', () => {
    expect(renderMarkdown('user_id and 2 * 3 * 4')).toBe('<p>user_id and 2 * 3 * 4</p>')
  })

  it('renders headings', () => {
    expect(renderMarkdown('# Title\n## Sub')).toBe('<h3>Title</h3><h4>Sub</h4>')
  })

  it('renders unordered and ordered lists, with wrapped item text', () => {
    expect(renderMarkdown('- a\n- b\n  more\n\n1. one\n2) two')).toBe(
      '<ul><li>a</li><li>b more</li></ul><ol><li>one</li><li>two</li></ol>',
    )
  })

  it('renders blockquotes and horizontal rules', () => {
    expect(renderMarkdown('> quoted\n> text\n\n---')).toBe('<blockquote><p>quoted<br>text</p></blockquote><hr>')
  })

  it('renders safe links only', () => {
    expect(renderMarkdown('[docs](https://mermaid.js.org/?a=1&b=2) [x](javascript:alert(1))')).toBe(
      '<p><a href="https://mermaid.js.org/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">docs</a> [x](javascript:alert(1))</p>',
    )
  })

  it('renders tables', () => {
    expect(renderMarkdown('| Class | Role |\n|---|:-:|\n| Book | item |\n| Loan | link |')).toBe(
      '<table><thead><tr><th>Class</th><th>Role</th></tr></thead>' +
        '<tbody><tr><td>Book</td><td>item</td></tr><tr><td>Loan</td><td>link</td></tr></tbody></table>',
    )
  })
})
