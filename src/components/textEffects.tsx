import { motion } from 'motion/react'
import { useMemo } from 'react'
import { streamTokens } from './streamTokens.ts'
import { useCountUp } from './useCountUp.ts'

type TextEffectProps = {
  text: string
  /** Starts the effect (after `delay` ms). Before that nothing shows. */
  active: boolean
  /** Shows the whole text right away (reduced motion). */
  instant?: boolean
  delay?: number
  onDone?: () => void
}

/**
 * Text typed letter by letter, with a caret, the way a person types. Screen
 * readers get the whole text at once; the letters still to come take their
 * place invisibly, so the layout never shifts.
 */
export function TypedText({ text, active, instant, delay, onDone, charMs = 30 }: TextEffectProps & { charMs?: number }) {
  const count = useCountUp(text.length, {
    active,
    instant,
    delay,
    onDone,
    // Uneven, like real typing: a beat after spaces and longer after punctuation.
    stepMs: (i) => charMs + (i % 3) * 8 + (text[i - 1] === ' ' ? 15 : 0) + (/[.,]/.test(text[i - 1] ?? '') ? 120 : 0),
  })
  const typing = active && !instant && count < text.length
  return (
    <span>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        <span data-shown="">{text.slice(0, count)}</span>
        {typing && <Caret />}
        <span className="invisible">{text.slice(count)}</span>
      </span>
    </span>
  )
}

/**
 * Text that streams in token by token, like a model's reply: short word
 * pieces, each fading in. Screen readers get the whole text at once.
 */
export function StreamedText({ text, active, instant, delay, onDone, tokenMs = 40 }: TextEffectProps & { tokenMs?: number }) {
  const tokens = useMemo(() => streamTokens(text), [text])
  const count = useCountUp(tokens.length, {
    active,
    instant,
    delay,
    onDone,
    stepMs: (i) => tokenMs + (i % 3) * 12,
  })
  return (
    <span>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        <span data-shown="">
          {tokens.slice(0, count).map((token, i) =>
            instant ? (
              token
            ) : (
              <motion.span key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                {token}
              </motion.span>
            ),
          )}
        </span>
        <span className="invisible">{tokens.slice(count).join('')}</span>
      </span>
    </span>
  )
}

/** A blinking text caret that takes no width, so the text doesn't move. */
function Caret() {
  return (
    <span className="relative inline-block w-0">
      <span className="absolute -bottom-[0.1em] left-[0.04em] h-[1em] w-[0.07em] animate-caret bg-current" />
    </span>
  )
}
