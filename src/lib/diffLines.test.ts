import { describe, expect, it } from 'vitest'
import { diffLines } from './diffLines.ts'

describe('diffLines', () => {
  it('marks lines as unchanged, removed or added, in order', () => {
    expect(diffLines('classDiagram\n  class Book\n  class Loan', 'classDiagram\n  class Book\n  class Member\n  class Loan')).toEqual([
      { kind: 'same', text: 'classDiagram' },
      { kind: 'same', text: '  class Book' },
      { kind: 'added', text: '  class Member' },
      { kind: 'same', text: '  class Loan' },
    ])
  })

  it('shows a changed line as removed then added', () => {
    expect(diffLines('a\nb\nc', 'a\nB\nc')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'removed', text: 'b' },
      { kind: 'added', text: 'B' },
      { kind: 'same', text: 'c' },
    ])
  })

  it('handles empty sides and Windows line endings', () => {
    expect(diffLines('', 'x')).toEqual([{ kind: 'added', text: 'x' }])
    expect(diffLines('x\r\ny', 'x\ny')).toEqual([
      { kind: 'same', text: 'x' },
      { kind: 'same', text: 'y' },
    ])
  })
})
