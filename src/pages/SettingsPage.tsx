import { useLiveQuery } from 'dexie-react-hooks'
import { useId, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import {
  loadAgentSettings,
  MAX_STEPS_RANGE,
  saveAgentSettings,
  type AgentSettings,
} from '../agent/settings.ts'
import { db } from '../db.ts'
import { providerKinds, type ProviderKind } from '../providers.ts'

const card =
  'block rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-zinc-400 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600'

export function SettingsPage() {
  const providers = useLiveQuery(() => db.providers.toArray())
  const agentSettings = useLiveQuery(loadAgentSettings)

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Settings</h1>

      <section className="mt-8">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">LLM providers</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          The models GraphiteAI can use. Keys and settings are stored only in this browser.
        </p>

        {providers?.length === 0 && (
          <p className="mt-4 rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            No providers yet. Add one below.
          </p>
        )}

        <ul aria-label="Configured providers" className="mt-4 grid gap-2">
          {providers?.map((provider) => (
            <li key={provider.id}>
              <Link to={`providers/${provider.id}`} className={`${card} flex items-baseline justify-between gap-4`}>
                <span className="truncate font-medium text-zinc-900 dark:text-zinc-50">{provider.name}</span>
                <span className="shrink-0 text-sm text-zinc-500 dark:text-zinc-400">
                  {providerKinds[provider.kind].label}
                  {provider.args.model ? ` · ${String(provider.args.model)}` : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <h3 className="mt-8 text-sm font-medium text-zinc-500 dark:text-zinc-400">Add a provider</h3>
        <ul className="mt-2 grid gap-2 sm:grid-cols-3">
          {(Object.keys(providerKinds) as ProviderKind[]).map((kind) => (
            <li key={kind}>
              <Link to={`providers/new/${kind}`} className={`${card} h-full`}>
                <span className="block font-medium text-zinc-900 dark:text-zinc-50">
                  {providerKinds[kind].label}
                </span>
                <span className="mt-1 block text-sm text-zinc-500 dark:text-zinc-400">
                  {providerKinds[kind].description}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Agent</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          How GraphiteAI works on a reply before answering.
        </p>
        {agentSettings && <AgentSettingsForm initial={agentSettings} />}
      </section>
    </>
  )
}

function AgentSettingsForm({ initial }: { initial: AgentSettings }) {
  const [maxSteps, setMaxSteps] = useState(String(initial.maxSteps))
  const [saved, setSaved] = useState(false)
  const id = useId()

  async function save(event: FormEvent) {
    event.preventDefault()
    await saveAgentSettings({ maxSteps: Number(maxSteps) })
    setMaxSteps(String((await loadAgentSettings()).maxSteps))
    setSaved(true)
  }

  return (
    <form onSubmit={save} className="mt-4 flex flex-wrap items-end gap-3">
      <div>
        <label htmlFor={id} className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Max steps per reply
        </label>
        <input
          id={id}
          type="number"
          required
          min={MAX_STEPS_RANGE.min}
          max={MAX_STEPS_RANGE.max}
          value={maxSteps}
          onChange={(event) => {
            setMaxSteps(event.target.value)
            setSaved(false)
          }}
          className="mt-1 w-28 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Model calls (thinking, tool use, fixing diagrams) before it must answer. {MAX_STEPS_RANGE.min}–
          {MAX_STEPS_RANGE.max}.
        </p>
      </div>
      <button
        type="submit"
        aria-label="Save agent settings"
        className="mb-5 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        Save
      </button>
      {saved && (
        <span role="status" className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
          Saved
        </span>
      )}
    </form>
  )
}
