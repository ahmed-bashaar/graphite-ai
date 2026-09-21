import { useState } from 'react'

/** A "Delete {noun}" button that asks for an inline confirmation first. */
export function ConfirmDelete({
  noun,
  detail,
  onConfirm,
}: {
  noun: string
  /** What else goes with it, e.g. "and all its chats and diagrams". */
  detail?: string
  onConfirm: () => void | Promise<void>
}) {
  const [asking, setAsking] = useState(false)

  if (asking) {
    return (
      <span className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
        <span className="hidden sm:inline">
          Delete this {noun}
          {detail ? ` ${detail}` : ''}?
        </span>
        <button
          type="button"
          onClick={() => void onConfirm()}
          className="rounded-lg bg-red-600 px-2.5 py-1 font-medium text-white hover:bg-red-700"
        >
          Yes, delete
        </button>
        <button
          type="button"
          onClick={() => setAsking(false)}
          className="rounded-lg px-2.5 py-1 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
      </span>
    )
  }

  return (
    <button
      type="button"
      aria-label={`Delete ${noun}`}
      title={`Delete ${noun}`}
      onClick={() => setAsking(true)}
      className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
    >
      <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}
