import { useLiveQuery } from 'dexie-react-hooks'
import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { db, type ProviderRecord } from '../db.ts'
import type { Args, Parameter } from '../lib/index.ts'
import { isProviderKind, providerKinds, type ProviderKind } from '../providers.ts'
import { NotFound } from './NotFound.tsx'

/** `/app/settings/providers/new/:kind` (create) and `/app/settings/providers/:providerId` (edit). */
export function ProviderPage() {
  const { kind, providerId } = useParams()
  const id = Number(providerId)
  // undefined while loading, null when the provider doesn't exist.
  const record = useLiveQuery(
    async () => (providerId ? ((await db.providers.get(id)) ?? null) : null),
    [providerId],
  )

  if (!providerId) {
    return isProviderKind(kind) ? <ProviderForm kind={kind} /> : <NotFound what="Provider type" />
  }
  if (record === null) return <NotFound what="Provider" />
  if (!record) return null
  return <ProviderForm key={record.id} kind={record.kind} record={record} />
}

const LABELS: Record<string, string> = { apiKey: 'API key', baseUrl: 'Base URL', model: 'Model' }

const input =
  'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-500 focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50'
const secondaryButton =
  'rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'

type ModelList = { status: 'idle' | 'loading' } | { status: 'loaded'; models: string[] } | { status: 'error'; error: string }

function ProviderForm({ kind, record }: { kind: ProviderKind; record?: ProviderRecord }) {
  const info = providerKinds[kind]
  const [provider] = useState(() => info.create())
  const parameters = provider.exposeParameters()
  const navigate = useNavigate()
  const formId = useId()

  const [name, setName] = useState(record?.name ?? info.label)
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(parameters.map((p) => [p.name, String(record?.args[p.name] ?? p.default ?? '')])),
  )
  const [error, setError] = useState<string | null>(null)
  const [models, setModels] = useState<ModelList>({ status: 'idle' })

  const args = (): Args => Object.fromEntries(parameters.map((p) => [p.name, parseValue(p, values[p.name])]))

  async function save(event: FormEvent) {
    event.preventDefault()
    try {
      provider.provideModel(args()) // validates required settings
    } catch (e) {
      setError(errorText(e))
      return
    }
    const data = { kind, name: name.trim() || info.label, args: args() }
    if (record) await db.providers.update(record.id, data)
    else await db.providers.add(data)
    navigate('/app/settings')
  }

  async function remove() {
    if (!record) return
    await db.providers.delete(record.id)
    navigate('/app/settings')
  }

  async function loadModels() {
    setModels({ status: 'loading' })
    try {
      setModels({ status: 'loaded', models: await provider.listModels(args()) })
    } catch (e) {
      setModels({ status: 'error', error: errorText(e) })
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-5">
      <div>
        <Link to="/app/settings" className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
          ← Settings
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {record ? `Edit ${record.name}` : `Add ${info.label}`}
        </h1>
        <p className="mt-1 text-zinc-500 dark:text-zinc-400">{info.description}</p>
      </div>

      <Field id={`${formId}-name`} label="Name">
        <input id={`${formId}-name`} value={name} onChange={(e) => setName(e.target.value)} className={input} />
      </Field>

      {parameters.map((p) => {
        const id = `${formId}-${p.name}`
        const isModel = p.name === 'model'
        return (
          <Field key={p.name} id={id} label={LABELS[p.name] ?? p.name} parameter={p}>
            <div className="flex gap-2">
              <input
                id={id}
                type={p.secret ? 'password' : p.type === 'number' ? 'number' : 'text'}
                autoComplete="off"
                list={isModel ? `${id}-options` : undefined}
                value={values[p.name]}
                onChange={(e) => setValues({ ...values, [p.name]: e.target.value })}
                className={input}
              />
              {isModel && (
                <button
                  type="button"
                  onClick={loadModels}
                  disabled={models.status === 'loading'}
                  className={`${secondaryButton} shrink-0`}
                >
                  {models.status === 'loading' ? 'Loading…' : 'Load models'}
                </button>
              )}
            </div>
            {isModel && (
              <>
                <datalist id={`${id}-options`}>
                  {models.status === 'loaded' && models.models.map((m) => <option key={m} value={m} />)}
                </datalist>
                {models.status === 'loaded' && (
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    {models.models.length} models available. Pick one from the field's suggestions.
                  </p>
                )}
                {models.status === 'error' && (
                  <p role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">
                    Couldn't load models: {models.error}
                  </p>
                )}
              </>
            )}
          </Field>
        )
      })}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Save
        </button>
        <Link to="/app/settings" className={secondaryButton}>
          Cancel
        </Link>
        {record && (
          <button
            type="button"
            onClick={remove}
            className="ml-auto rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
          >
            Remove
          </button>
        )}
      </div>
    </form>
  )
}

function Field({
  id,
  label,
  parameter,
  children,
}: {
  id: string
  label: string
  parameter?: Parameter
  children: ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
        {parameter && !parameter.required && <span className="font-normal text-zinc-400"> (optional)</span>}
      </label>
      {children}
      {parameter?.description && (
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{parameter.description}</p>
      )}
    </div>
  )
}

function parseValue(parameter: Parameter, value: string): unknown {
  const trimmed = value.trim()
  if (parameter.type === 'number' && trimmed !== '') return Number(trimmed)
  return trimmed
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))
