import { useEffect, useState } from 'react'
import { renderMermaid } from './renderMermaid.ts'

export type MermaidResult =
  | { status: 'loading' }
  | { status: 'done'; svg: string }
  | { status: 'error'; error: string }

/** The SVG for Mermaid `source`, re-rendered whenever it changes. */
export function useMermaid(source: string): MermaidResult {
  const [result, setResult] = useState<{ source: string; result: MermaidResult } | null>(null)

  useEffect(() => {
    let current = true
    renderMermaid(source).then(
      (svg) => current && setResult({ source, result: { status: 'done', svg } }),
      (e: unknown) =>
        current && setResult({ source, result: { status: 'error', error: e instanceof Error ? e.message : String(e) } }),
    )
    return () => {
      current = false
    }
  }, [source])

  // Ignore a finished render of an older source.
  return result?.source === source ? result.result : { status: 'loading' }
}
