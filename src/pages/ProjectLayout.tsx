import { useLiveQuery } from 'dexie-react-hooks'
import { NavLink, Outlet, useNavigate, useParams } from 'react-router'
import { Brand } from '../components/Brand.tsx'
import { SettingsIcon } from '../components/SettingsIcon.tsx'
import { db } from '../db.ts'
import { NEW_CHAT_TITLE } from '../agent/chatTitle.ts'
import { NotFound } from './NotFound.tsx'

const navItem = ({ isActive }: { isActive: boolean }) =>
  `block truncate rounded-lg px-3 py-2 text-sm ${
    isActive
      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
      : 'text-zinc-700 hover:bg-zinc-200/70 dark:text-zinc-300 dark:hover:bg-zinc-800'
  }`

const sectionHeading = 'px-3 text-xs font-medium uppercase tracking-wider text-zinc-400'

/** The wireframe shell: sidebar (chats + diagrams), top bar, and the routed page. */
export function ProjectLayout() {
  const projectId = Number(useParams().projectId)
  const navigate = useNavigate()
  // undefined while loading, null when the project doesn't exist.
  const project = useLiveQuery(async () => (await db.projects.get(projectId)) ?? null, [projectId])
  const sessions = useLiveQuery(
    () => db.chatSessions.where({ projectId }).reverse().sortBy('id'),
    [projectId],
  )
  const diagrams = useLiveQuery(() => db.diagrams.where({ projectId }).toArray(), [projectId])

  async function newChat() {
    const id = await db.chatSessions.add({ projectId, title: NEW_CHAT_TITLE, draft: '' })
    navigate(`/projects/${projectId}/chats/${id}`)
  }

  if (project === null) return <NotFound what="Project" />

  return (
    <div className="flex h-svh bg-white dark:bg-zinc-950">
      <aside className="flex w-64 shrink-0 flex-col gap-4 border-r border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="px-2 pt-1">
          <Brand />
        </div>

        <button
          type="button"
          onClick={newChat}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          + New chat
        </button>

        <nav aria-label="Project" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          <section className="flex flex-col gap-1">
            <h2 className={sectionHeading}>Chats</h2>
            {sessions?.length === 0 && <p className="px-3 text-sm text-zinc-400">No chats yet</p>}
            {sessions?.map((session) => (
              <NavLink key={session.id} to={`chats/${session.id}`} className={navItem}>
                {session.title}
              </NavLink>
            ))}
          </section>

          <section className="flex flex-col gap-1">
            <h2 className={sectionHeading}>Diagrams</h2>
            {diagrams?.length === 0 && (
              <p className="px-3 text-sm text-zinc-400">No diagrams yet</p>
            )}
            {diagrams?.map((diagram) => (
              <NavLink key={diagram.id} to={`diagrams/${diagram.id}`} className={navItem}>
                {diagram.name}
              </NavLink>
            ))}
          </section>
        </nav>

        <NavLink to="/settings" className={`${navItem({ isActive: false })} flex items-center gap-2`}>
          <SettingsIcon />
          Settings
        </NavLink>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center border-b border-zinc-200 px-6 dark:border-zinc-800">
          <h1 className="truncate font-medium text-zinc-900 dark:text-zinc-50">{project?.name}</h1>
        </header>
        <main className="min-h-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
