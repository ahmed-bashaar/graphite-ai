import { useRef, useState, type ElementType } from 'react'

/**
 * A title with a "Rename {noun}" pencil button. Enter or blur saves, Escape cancels;
 * blank or unchanged values are ignored.
 */
export function EditableTitle({
  value,
  noun,
  fieldLabel,
  onSave,
  as: Tag = 'span',
  id,
  className = '',
}: {
  value: string
  noun: string
  fieldLabel: string
  onSave: (value: string) => void | Promise<void>
  as?: ElementType
  id?: string
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const done = useRef(false)

  function finish(input: HTMLInputElement, save: boolean) {
    if (done.current) return
    done.current = true
    const next = input.value.trim()
    if (save && next && next !== value) void onSave(next)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        aria-label={fieldLabel}
        defaultValue={value}
        autoFocus
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') finish(e.currentTarget, true)
          if (e.key === 'Escape') finish(e.currentTarget, false)
        }}
        onBlur={(e) => finish(e.currentTarget, true)}
        className={`min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-0.5 text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 ${className}`}
      />
    )
  }

  return (
    <span className="group flex min-w-0 items-center gap-1">
      <Tag id={id} className={`truncate ${className}`}>
        {value}
      </Tag>
      <button
        type="button"
        aria-label={`Rename ${noun}`}
        title={`Rename ${noun}`}
        onClick={() => {
          done.current = false
          setEditing(true)
        }}
        className="shrink-0 rounded p-1 text-zinc-400 opacity-60 hover:bg-zinc-100 hover:text-zinc-700 group-hover:opacity-100 focus-visible:opacity-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
      >
        <svg viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M13.5 3.5l3 3L7 16H4v-3z" strokeLinejoin="round" />
        </svg>
      </button>
    </span>
  )
}
