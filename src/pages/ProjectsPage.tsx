import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Brand } from '../components/Brand.tsx'
import { db } from '../db.ts'

export function ProjectsPage() {
  const projects = useLiveQuery(() => db.projects.orderBy('createdAt').reverse().toArray())
  const [name, setName] = useState('')
  const navigate = useNavigate()

  async function createProject(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    const id = await db.projects.add({ name: trimmed, createdAt: new Date() })
    navigate(`/projects/${id}`)
  }

  return (
    <div className="min-h-svh bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <Brand />
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Projects
        </h1>
        <p className="mt-1 text-zinc-500 dark:text-zinc-400">
          Each project holds the chats and UML diagrams you create with GraphiteAI.
        </p>

        <form onSubmit={createProject} className="mt-6 flex gap-2">
          <label htmlFor="project-name" className="sr-only">
            Project name
          </label>
          <input
            id="project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New project name"
            className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-500 focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <button
            type="submit"
            disabled={!name.trim()}
            className="rounded-lg bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Create project
          </button>
        </form>

        {projects?.length === 0 && (
          <p className="mt-10 rounded-xl border border-dashed border-zinc-300 p-10 text-center text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            No projects yet. Create one to start designing.
          </p>
        )}

        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects?.map((project) => (
            <li key={project.id}>
              <Link
                to={`/projects/${project.id}`}
                className="block rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-zinc-400 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
              >
                <span className="block truncate font-medium text-zinc-900 dark:text-zinc-50">
                  {project.name}
                </span>
                <span className="mt-1 block text-sm text-zinc-500 dark:text-zinc-400">
                  Created {project.createdAt.toLocaleDateString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}
