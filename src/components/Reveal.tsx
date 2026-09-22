import { motion } from 'motion/react'
import type { ReactNode } from 'react'

const easeOut = [0.22, 1, 0.36, 1] as const

const effects = {
  /** Fades in while sliding up. */
  rise: {
    hidden: { opacity: 0, y: 16 },
    shown: (duration = 0.6) => ({ opacity: 1, y: 0, transition: { duration, ease: easeOut } }),
  },
  /** Pops into place: a quick fade with a springy scale. */
  pop: {
    hidden: { opacity: 0, scale: 0.85 },
    shown: (duration = 0.35) => ({
      opacity: 1,
      scale: 1,
      transition: { type: 'spring' as const, stiffness: 460, damping: 26, opacity: { duration, ease: 'easeOut' as const } },
    }),
  },
} as const

type RevealProps = {
  shown: boolean
  effect?: keyof typeof effects
  /** Seconds to wait once shown. */
  delay?: number
  /** Seconds the fade takes (0.6 for `rise`, 0.35 for `pop`). */
  duration?: number
  className?: string
  children: ReactNode
}

/**
 * Keeps its content's space but hides it until `shown`, then animates it in.
 * Content that is already shown when it mounts (reduced motion) doesn't animate.
 * `data-revealed` tells tests where the sequence is.
 */
export function Reveal({ shown, effect = 'rise', delay = 0, duration, className, children }: RevealProps) {
  const { hidden, shown: visible } = effects[effect]
  const target = visible(duration)
  return (
    <motion.div
      data-revealed={shown}
      className={className}
      initial={shown ? false : 'hidden'}
      animate={shown ? 'shown' : 'hidden'}
      variants={{ hidden, shown: { ...target, transition: { ...target.transition, delay } } }}
    >
      {children}
    </motion.div>
  )
}
