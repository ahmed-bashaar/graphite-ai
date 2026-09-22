import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { streamTokens } from './streamTokens.ts'
import { StreamedText, TypedText } from './textEffects.tsx'

/** The part of the text that is showing so far. */
function shown() {
  return document.querySelector('[data-shown]')?.textContent ?? null
}

/** Elements with exactly `text` that screen readers can reach. */
function readable(text: string) {
  return screen.getAllByText(text).filter((el) => !el.closest('[aria-hidden]'))
}

/** Advances time in small steps, recording each distinct `shown()` value. */
async function record(ms: number) {
  const seen = [shown()]
  for (let t = 0; t < ms; t += 5) {
    await act(() => vi.advanceTimersByTimeAsync(5))
    if (shown() !== seen.at(-1)) seen.push(shown())
  }
  return seen
}

describe('streamTokens', () => {
  it('splits text into short word pieces that carry their leading space', () => {
    const text = 'Here is the class diagram for the ordering flow.'
    const tokens = streamTokens(text)
    expect(tokens.join('')).toBe(text)
    expect(tokens.slice(0, 3)).toEqual(['Here', ' is', ' the'])
    expect(tokens).toContain(' order')
    for (const token of tokens) expect(token.trim().length).toBeLessThanOrEqual(5)
  })
})

describe('text effects', () => {
  beforeEach(() => {
    // Only timeouts: Motion's frame loop must keep real animation frames, or it stalls for later tests.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('TypedText', () => {
    it('types the text letter by letter, keeping all of it for screen readers', async () => {
      const onDone = vi.fn()
      render(<TypedText text="Hi there" active onDone={onDone} />)
      expect(readable('Hi there')).toHaveLength(1)

      const seen = await record(2000)
      expect(seen).toEqual(['', 'H', 'Hi', 'Hi ', 'Hi t', 'Hi th', 'Hi the', 'Hi ther', 'Hi there'])
      expect(onDone).toHaveBeenCalledTimes(1)
    })

    it('waits until it is active, then for its delay', async () => {
      const { rerender } = render(<TypedText text="Hi" active={false} />)
      await record(1000)
      expect(shown()).toBe('')

      rerender(<TypedText text="Hi" active delay={500} />)
      await act(() => vi.advanceTimersByTimeAsync(450))
      expect(shown()).toBe('')
      await record(1000)
      expect(shown()).toBe('Hi')
    })

    it('shows the whole text at once when instant', () => {
      render(<TypedText text="Hi there" active={false} instant />)
      expect(shown()).toBe('Hi there')
    })
  })

  describe('StreamedText', () => {
    it('streams the text token by token, like a model reply', async () => {
      const text = 'Here is the class diagram for the ordering flow.'
      const onDone = vi.fn()
      render(<StreamedText text={text} active onDone={onDone} />)
      expect(readable(text)).toHaveLength(1)

      const seen = await record(5000)
      const prefixes = streamTokens(text).map((_, i, tokens) => tokens.slice(0, i + 1).join(''))
      expect(seen).toEqual(['', ...prefixes])
      expect(onDone).toHaveBeenCalledTimes(1)
    })

    it('shows the whole text at once when instant', () => {
      render(<StreamedText text="Get the diagram." active={false} instant />)
      expect(shown()).toBe('Get the diagram.')
    })
  })
})
