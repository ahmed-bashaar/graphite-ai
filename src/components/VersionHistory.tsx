import type { DiagramVersionRecord } from '../db.ts'
import { diffLines } from '../lib/index.ts'

const AUTHORS: Record<DiagramVersionRecord['author'], string> = {
  agent: 'GraphiteAI',
  user: 'You',
  earlier: 'Before version history',
}

/** Who saved a version, e.g. "You · restored". */
function authorLabel(version: DiagramVersionRecord): string {
  return AUTHORS[version.author] + (version.restoredFrom !== undefined ? ' · restored' : '')
}

function timeLabel(version: DiagramVersionRecord): string {
  return version.author === 'earlier' ? 'Earlier' : version.savedAt.toLocaleString()
}

/**
 * The saved versions of a diagram, newest (current) first. Selecting an
 * earlier one previews it.
 */
export function VersionHistory({
  versions,
  selectedId,
  onSelect,
}: {
  versions: DiagramVersionRecord[]
  selectedId: number | null
  onSelect: (versionId: number | null) => void
}) {
  return (
    <section
      aria-label="Version history"
      className="rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h3 className="px-1 pb-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">History</h3>
      {versions.length === 0 ? (
        <p className="px-1 text-sm text-zinc-500 dark:text-zinc-400">
          No earlier versions yet. From now on, every change to this diagram is kept here.
        </p>
      ) : (
        <ol className="flex flex-col gap-1">
          {versions.map((version, i) => {
            const current = i === 0
            const selected = current ? selectedId === null : selectedId === version.id
            return (
              <li key={version.id}>
                <button
                  type="button"
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => onSelect(current ? null : version.id)}
                  className={`flex w-full flex-col rounded-lg px-2.5 py-1.5 text-left text-sm ${
                    selected ? 'bg-zinc-100 dark:bg-zinc-800' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                  }`}
                >
                  <span className="flex items-center justify-between gap-2 font-medium text-zinc-900 dark:text-zinc-100">
                    {authorLabel(version)}
                    {current && (
                      <span className="rounded-full bg-zinc-900 px-1.5 text-[0.7rem] text-white dark:bg-zinc-100 dark:text-zinc-900">
                        Current
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">{timeLabel(version)}</span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

/** The banner above an earlier version's preview, with what can be done with it. */
export function EarlierVersionBar({
  version,
  comparing,
  onCompare,
  onRestore,
  onBack,
}: {
  version: DiagramVersionRecord
  comparing: boolean
  onCompare: () => void
  onRestore: () => void
  onBack: () => void
}) {
  const button =
    'rounded-lg border border-amber-300 px-3 py-1 text-sm font-medium hover:bg-amber-100 dark:border-amber-800 dark:hover:bg-amber-900'
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
      <span className="mr-auto">
        Viewing an earlier version ({authorLabel(version)}, {timeLabel(version)}).
      </span>
      <button type="button" aria-pressed={comparing} onClick={onCompare} className={button}>
        Compare with current
      </button>
      <button type="button" onClick={onRestore} className={button}>
        Restore this version
      </button>
      <button type="button" onClick={onBack} className={button}>
        Back to current
      </button>
    </div>
  )
}

/** A line diff of the source, from the earlier version to the current one. */
export function SourceDiff({ before, after }: { before: string; after: string }) {
  const lines = diffLines(before, after)
  return (
    <section
      aria-label="Changes"
      className="overflow-x-auto rounded-xl border border-zinc-200 bg-white font-mono text-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <p className="border-b border-zinc-100 px-3 py-1.5 font-sans text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        Changes from this version to the current one
      </p>
      <pre className="py-1.5">
        {lines.map((line, i) =>
          line.kind === 'added' ? (
            <ins
              key={i}
              className="block bg-emerald-50 px-3 text-emerald-900 no-underline before:content-['+_'] dark:bg-emerald-950 dark:text-emerald-200"
            >
              {line.text}
            </ins>
          ) : line.kind === 'removed' ? (
            <del
              key={i}
              className="block bg-red-50 px-3 text-red-900 no-underline before:content-['-_'] dark:bg-red-950 dark:text-red-200"
            >
              {line.text}
            </del>
          ) : (
            <span key={i} className="block px-3 text-zinc-600 before:content-['__'] dark:text-zinc-300">
              {line.text}
            </span>
          ),
        )}
      </pre>
    </section>
  )
}
