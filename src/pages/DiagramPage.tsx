import { useLiveQuery } from 'dexie-react-hooks'
import { useId, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ConfirmDelete } from '../components/ConfirmDelete.tsx'
import { EditableTitle } from '../components/EditableTitle.tsx'
import { MermaidSvg } from '../components/MermaidSvg.tsx'
import { useMermaid } from '../components/useMermaid.ts'
import { db, type DiagramRecord } from '../db.ts'
import { diagramTypeLabel, retitle } from '../lib/index.ts'
import { deleteDiagram } from '../mutations.ts'
import { NotFound } from './NotFound.tsx'

export function DiagramPage() {
  const diagramId = Number(useParams().diagramId)
  // undefined while loading, null when the diagram doesn't exist.
  const record = useLiveQuery(async () => (await db.diagrams.get(diagramId)) ?? null, [diagramId])

  if (record === null) return <NotFound what="Diagram" />
  if (!record) return null
  return <DiagramView key={record.id} diagram={record} />
}

const button =
  'rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'

function DiagramView({ diagram }: { diagram: DiagramRecord }) {
  const [draft, setDraft] = useState<string | null>(null)
  const editing = draft !== null
  const shown = draft ?? diagram.source
  const result = useMermaid(shown)
  const captionId = useId()
  const navigate = useNavigate()

  // The agent identifies diagrams by their Mermaid title, so keep it in sync.
  async function rename(name: string) {
    await db.diagrams.update(diagram.id, { name, source: retitle(diagram.source, name) })
  }

  async function save() {
    if (draft === null) return
    await db.diagrams.update(diagram.id, { source: draft })
    setDraft(null)
  }

  return (
    <div className="h-full overflow-auto p-6">
      <figure aria-labelledby={captionId} className="mx-auto flex max-w-5xl flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <EditableTitle
            as="h2"
            id={captionId}
            value={diagram.name}
            noun="diagram"
            fieldLabel="Diagram name"
            onSave={rename}
            className="text-lg font-medium text-zinc-900 dark:text-zinc-50"
          />
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {diagramTypeLabel(diagram.type)}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {!editing && (
              <button type="button" onClick={() => setDraft(diagram.source)} className={button}>
                Edit source
              </button>
            )}
            {result.status === 'done' && (
              <a
                href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}`}
                download={`${diagram.name.replace(/[\\/:*?"<>|]/g, '-')}.svg`}
                className={button}
              >
                Download SVG
              </a>
            )}
            <ConfirmDelete
              noun="diagram"
              onConfirm={async () => {
                await deleteDiagram(diagram.id)
                navigate(`/projects/${diagram.projectId}`)
              }}
            />
          </div>
        </div>

        {editing && (
          <div className="flex flex-col gap-2">
            <textarea
              aria-label="Mermaid source"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
              rows={Math.min(20, Math.max(6, draft.split('\n').length + 1))}
              className="w-full rounded-xl border border-zinc-300 bg-white p-3 font-mono text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={save}
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                Save
              </button>
              <button type="button" onClick={() => setDraft(null)} className={button}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <MermaidSvg result={result} source={shown} />
        </div>
      </figure>
    </div>
  )
}
