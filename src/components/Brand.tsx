import { Link } from 'react-router'
import { Logo } from './Logo.tsx'

/** Logo and product name; always leads back to the projects page. */
export function Brand() {
  return (
    <Link
      to="/"
      className="flex items-center gap-2.5 rounded-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
    >
      <Logo />
      GraphiteAI
    </Link>
  )
}
