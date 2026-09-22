export type DiffLine = { kind: 'same' | 'added' | 'removed'; text: string }

/**
 * A line diff turning `before` into `after`, from their longest common
 * subsequence. Within a change, removed lines come before added ones.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = splitLines(before)
  const b = splitLines(after)
  // common[i][j]: length of the longest common subsequence of a[i..] and b[j..].
  const common = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      common[i][j] = a[i] === b[j] ? common[i + 1][j + 1] + 1 : Math.max(common[i + 1][j], common[i][j + 1])
    }
  }
  const lines: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      lines.push({ kind: 'same', text: a[i] })
      i++
      j++
    } else if (j >= b.length || (i < a.length && common[i + 1][j] >= common[i][j + 1])) {
      lines.push({ kind: 'removed', text: a[i++] })
    } else {
      lines.push({ kind: 'added', text: b[j++] })
    }
  }
  return lines
}

const splitLines = (text: string) => (text === '' ? [] : text.replace(/\r\n?/g, '\n').split('\n'))
