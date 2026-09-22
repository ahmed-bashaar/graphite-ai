import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import type { ContextPart } from '../agent/conversation.ts'
import { attachmentKind, diagramTypeLabel } from '../lib/index.ts'

type DiagramOption = { id: number; name: string; type: string }

const ACCEPT = [
  'image/png,image/jpeg,image/gif,image/webp,application/pdf',
  '.txt,.log,.md,.markdown,.json,.csv,.tsv,.xml,.yaml,.yml,.toml,.mmd,.mermaid,.puml,.plantuml,.dot,.sql',
  '.js,.jsx,.ts,.tsx,.py,.java,.kt,.cs,.go,.rb,.php,.swift,.c,.h,.cpp,.rs,.html,.css',
].join(',')

/**
 * The circle button left of the message field: attach images and files, or
 * reference one of the project's diagrams.
 */
export function AddContext({
  diagrams,
  onFiles,
  onDiagram,
}: {
  diagrams: DiagramOption[]
  onFiles: (files: File[]) => void
  onDiagram: (diagramId: number) => void
}) {
  const [open, setOpen] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !root.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const item =
    'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800'

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        aria-label="Add context"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="grid size-11 place-items-center rounded-full border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M10 4v12M4 10h12" strokeLinecap="round" />
        </svg>
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept={ACCEPT}
        aria-label="Attach files"
        onChange={(event) => {
          onFiles([...(event.target.files ?? [])])
          event.target.value = ''
        }}
      />
      {open && (
        <div
          role="menu"
          aria-label="Add context"
          className="absolute bottom-full left-0 z-10 mb-2 w-64 rounded-xl border border-zinc-200 bg-white p-1.5 text-zinc-900 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false)
              input.current?.click()
            }}
          >
            <PaperclipIcon />
            Upload images or files
          </button>
          <p className="mt-1.5 border-t border-zinc-100 px-2.5 pt-2 pb-1 text-xs text-zinc-500 dark:border-zinc-800">
            Reference a diagram
          </p>
          <div className="max-h-56 overflow-y-auto">
            {diagrams.length === 0 ? (
              <button type="button" role="menuitem" disabled className={item}>
                No diagrams yet
              </button>
            ) : (
              diagrams.map((diagram) => (
                <button
                  key={diagram.id}
                  type="button"
                  role="menuitem"
                  className={item}
                  onClick={() => {
                    setOpen(false)
                    onDiagram(diagram.id)
                  }}
                >
                  <DiagramIcon />
                  <span className="min-w-0 flex-1 truncate">{diagram.name}</span>
                  <span className="shrink-0 text-xs text-zinc-500">{diagramTypeLabel(diagram.type)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** The context waiting to be sent with the next message, each removable. */
export function ContextChips({
  parts,
  diagrams,
  onRemove,
}: {
  parts: ContextPart[]
  diagrams: DiagramOption[]
  onRemove: (index: number) => void
}) {
  if (parts.length === 0) return null
  return (
    <ul aria-label="Attached context" className="mb-2 flex flex-wrap gap-2">
      {parts.map((part, i) => {
        const name =
          part.type === 'attachment' ? part.name : (diagrams.find((d) => d.id === part.diagramId)?.name ?? 'Diagram')
        return (
          <li
            key={i}
            className="flex max-w-60 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 py-1 pr-1 pl-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {part.type === 'attachment' && attachmentKind(part.mediaType, part.name) === 'image' ? (
              <img src={dataUrl(part)} alt={part.name} className="size-8 rounded object-cover" />
            ) : part.type === 'attachment' ? (
              <PaperclipIcon />
            ) : (
              <DiagramIcon />
            )}
            <span className="min-w-0 flex-1 truncate">{name}</span>
            <button
              type="button"
              aria-label={`Remove ${name}`}
              onClick={() => onRemove(i)}
              className="grid size-6 shrink-0 place-items-center rounded text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800"
            >
              <svg viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
              </svg>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** A sent attachment in the user's message: the image itself (click to enlarge), or the file's name. */
export function SentAttachment({ part }: { part: Extract<ContextPart, { type: 'attachment' }> }) {
  const [open, setOpen] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)
  if (attachmentKind(part.mediaType, part.name) === 'image') {
    return (
      <>
        <button
          ref={opener}
          type="button"
          aria-label={`Open ${part.name}`}
          onClick={() => setOpen(true)}
          className="cursor-zoom-in self-start"
        >
          <img src={dataUrl(part)} alt={part.name} className="max-h-64 max-w-full rounded-lg object-contain" />
        </button>
        {open && (
          <ImageViewer
            name={part.name}
            src={dataUrl(part)}
            onClose={() => {
              setOpen(false)
              opener.current?.focus()
            }}
          />
        )}
      </>
    )
  }
  return (
    <span className="flex items-center gap-2 rounded-lg bg-white/10 px-2.5 py-1.5 text-sm dark:bg-black/10">
      <PaperclipIcon />
      <span className="truncate">{part.name}</span>
    </span>
  )
}

/** A diagram the user referenced, linking to it. */
export function SentDiagramReference({ name, href }: { name: string; href: string }) {
  return (
    <Link
      to={href}
      className="flex items-center gap-2 rounded-lg bg-white/10 px-2.5 py-1.5 text-sm hover:bg-white/20 dark:bg-black/10 dark:hover:bg-black/20"
    >
      <DiagramIcon />
      <span className="truncate">{name}</span>
    </Link>
  )
}

/** An image shown full size over the page; Escape, the close button or a click outside closes it. */
function ImageViewer({ name, src, onClose }: { name: string; src: string; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    close.current?.focus()
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={name}
      onClick={(event) => event.target === event.currentTarget && onClose()}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/80 p-4 sm:p-6"
    >
      <button
        ref={close}
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute top-4 right-4 grid size-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
        </svg>
      </button>
      <img src={src} alt={name} className="max-h-full max-w-full rounded-lg object-contain" />
      <p className="text-sm text-white/80">{name}</p>
    </div>
  )
}

const dataUrl = (part: { mediaType: string; data: string }) => `data:${part.mediaType};base64,${part.data}`

function PaperclipIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path
        d="M13.5 7.5l-5.3 5.3a1.5 1.5 0 0 1-2.1-2.1l6-6a3 3 0 0 1 4.2 4.2l-6.4 6.4a4.5 4.5 0 0 1-6.4-6.4L9 3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function DiagramIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <rect x="2.5" y="3" width="6" height="5" rx="1" />
      <rect x="11.5" y="12" width="6" height="5" rx="1" />
      <path d="M5.5 8v3.5a1 1 0 0 0 1 1h5" strokeLinecap="round" />
    </svg>
  )
}
