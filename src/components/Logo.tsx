/** GraphiteAI mark: three connected nodes, like a tiny diagram. */
export function Logo({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" className="fill-zinc-900 dark:fill-zinc-100" />
      <g className="stroke-zinc-50 dark:stroke-zinc-900" strokeWidth="2" fill="none">
        <path d="M11 11 21 11 16 21Z" strokeLinejoin="round" />
      </g>
      <g className="fill-zinc-50 dark:fill-zinc-900">
        <circle cx="11" cy="11" r="3" />
        <circle cx="21" cy="11" r="3" />
        <circle cx="16" cy="21" r="3" />
      </g>
    </svg>
  )
}
