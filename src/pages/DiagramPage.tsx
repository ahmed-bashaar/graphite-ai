import { useLiveQuery } from 'dexie-react-hooks'
import { useParams } from 'react-router'
import { RenderedHtml } from '../components/RenderedHtml.tsx'
import { db } from '../db.ts'
import { Diagram } from '../lib/index.ts'
import { NotFound } from './NotFound.tsx'

export function DiagramPage() {
  const diagramId = Number(useParams().diagramId)
  // undefined while loading, null when the diagram doesn't exist.
  const record = useLiveQuery(async () => (await db.diagrams.get(diagramId)) ?? null, [diagramId])

  if (record === null) return <NotFound what="Diagram" />
  if (!record) return null

  const diagram = new Diagram(record.type, record.name, record.source)
  return (
    <div className="h-full overflow-auto p-6">
      <RenderedHtml
        of={diagram}
        className="mx-auto max-w-4xl [&_figcaption]:mb-3 [&_figcaption]:font-medium [&_figcaption]:text-zinc-900 dark:[&_figcaption]:text-zinc-50 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-zinc-200 [&_pre]:bg-zinc-50 [&_pre]:p-4 [&_pre]:text-sm [&_pre]:text-zinc-800 dark:[&_pre]:border-zinc-800 dark:[&_pre]:bg-zinc-900 dark:[&_pre]:text-zinc-200"
      />
    </div>
  )
}
