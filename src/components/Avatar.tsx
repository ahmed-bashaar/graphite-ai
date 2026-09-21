import { Logo } from './Logo.tsx'

export function Avatar({ who }: { who: 'user' | 'agent' }) {
  if (who === 'agent') return <Logo className="size-9 shrink-0" />
  return (
    <span
      aria-hidden="true"
      className="grid size-9 shrink-0 place-items-center rounded-full bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
    >
      <svg viewBox="0 0 20 20" className="size-5" fill="currentColor">
        <circle cx="10" cy="7" r="3.5" />
        <path d="M3.5 17a6.5 6.5 0 0 1 13 0Z" />
      </svg>
    </span>
  )
}
