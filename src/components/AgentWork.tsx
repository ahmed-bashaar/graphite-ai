import type { AgentStep } from '../lib/index.ts'

/**
 * What GraphiteAI did before answering: its reasoning, tool calls and answer
 * checks. Listed openly while it works, and folded into a disclosure on the
 * saved reply.
 */
export function AgentWork({ steps, live = false }: { steps: AgentStep[]; live?: boolean }) {
  if (steps.length === 0) return null
  const list = (
    <ol className="flex flex-col gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
      {steps.map((step, i) => (
        <li key={i} className="flex min-w-0 gap-2">
          <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-600" />
          <Step step={step} live={live} />
        </li>
      ))}
    </ol>
  )
  if (live) return list
  return (
    <details className="group text-sm">
      <summary className="cursor-pointer text-zinc-500 select-none hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">
        Worked through {steps.length} {steps.length === 1 ? 'step' : 'steps'}
      </summary>
      <div className="mt-2 border-l border-zinc-200 pl-3 dark:border-zinc-700">{list}</div>
    </details>
  )
}

function Step({ step, live }: { step: AgentStep; live: boolean }) {
  switch (step.kind) {
    case 'thinking':
      return <p className={`min-w-0 whitespace-pre-wrap italic ${live ? 'line-clamp-3' : ''}`}>{step.text}</p>
    case 'note':
      return <p className="min-w-0 whitespace-pre-wrap">{step.text}</p>
    case 'check':
      return (
        <div className="min-w-0">
          <p>Mermaid couldn’t draw a diagram in the draft, so GraphiteAI fixed it before replying.</p>
          {!live && <pre className="mt-1 overflow-x-auto text-xs whitespace-pre-wrap">{step.text}</pre>}
        </div>
      )
    case 'tool':
      return (
        <p className={`min-w-0 ${step.isError ? 'text-amber-700 dark:text-amber-400' : ''}`}>
          {toolLabel(step)}
          {step.result === undefined && <span className="animate-pulse">…</span>}
        </p>
      )
  }
}

function toolLabel(step: Extract<AgentStep, { kind: 'tool' }>): string {
  const done = step.result !== undefined
  switch (step.name) {
    case 'check_diagram':
      if (!done) return 'Checking a diagram'
      return step.isError ? 'Checked a diagram: Mermaid found an error' : 'Checked a diagram: it renders'
    case 'list_diagrams':
      return 'Listed the project’s diagrams'
    case 'read_diagram':
      return `Read “${String(step.args.title ?? '')}”`
    default:
      return `Used ${step.name}`
  }
}
