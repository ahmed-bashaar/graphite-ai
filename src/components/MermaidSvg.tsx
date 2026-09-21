import type { MermaidResult } from './useMermaid.ts'

/** Shows a `useMermaid` result: the SVG, a drawing placeholder, or the error with the source. */
export function MermaidSvg({
  result,
  source,
  className = '',
}: {
  result: MermaidResult
  source: string
  className?: string
}) {
  if (result.status === 'loading') {
    return <p className="animate-pulse py-6 text-center text-sm text-zinc-400">Drawing…</p>
  }
  if (result.status === 'error') {
    return (
      <div className="flex flex-col gap-2">
        <p
          role="alert"
          className="whitespace-pre-wrap rounded-lg bg-amber-50 px-3 py-2 font-mono text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          Couldn't draw this diagram: {result.error}
        </p>
        <pre className="overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
          {source}
        </pre>
      </div>
    )
  }
  // Mermaid output with securityLevel 'strict' is sanitized (see renderMermaid.ts).
  return (
    <div
      className={`flex justify-center [&_svg]:h-auto [&_svg]:max-w-full ${className}`}
      dangerouslySetInnerHTML={{ __html: result.svg }}
    />
  )
}
