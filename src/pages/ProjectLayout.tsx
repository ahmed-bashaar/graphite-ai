import { useLiveQuery } from 'dexie-react-hooks'
import {
  useEffect,
  useId,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react'
import { NavLink, Outlet, useNavigate, useParams } from 'react-router'
import { Brand } from '../components/Brand.tsx'
import { ConfirmDelete } from '../components/ConfirmDelete.tsx'
import { EditableTitle } from '../components/EditableTitle.tsx'
import { SettingsIcon } from '../components/SettingsIcon.tsx'
import { useStoredState } from '../components/useStoredState.ts'
import { db } from '../db.ts'
import { deleteProject } from '../mutations.ts'
import { NEW_CHAT_TITLE } from '../agent/chatTitle.ts'
import { NotFound } from './NotFound.tsx'

const navItem = ({ isActive }: { isActive: boolean }) =>
  `block truncate rounded-lg px-3 py-2 text-sm ${
    isActive
      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
      : 'text-zinc-700 hover:bg-zinc-200/70 dark:text-zinc-300 dark:hover:bg-zinc-800'
  }`

const sectionHeading = 'px-3 text-xs font-medium uppercase tracking-wider text-zinc-400'

/** Sidebar width limits on md+ screens, in pixels; arrow keys resize by one step. */
const SIDEBAR = { min: 200, max: 480, initial: 256, step: 16 }

const clampWidth = (width: number) => Math.round(Math.min(SIDEBAR.max, Math.max(SIDEBAR.min, width)))
const parseWidth = (stored: unknown) => (typeof stored === 'number' ? clampWidth(stored) : undefined)
const parseFlag = (stored: unknown) => (typeof stored === 'boolean' ? stored : undefined)

const iconButton =
  'grid size-9 shrink-0 place-items-center rounded-lg text-zinc-600 hover:bg-zinc-200/70 dark:text-zinc-300 dark:hover:bg-zinc-800'

/**
 * The wireframe shell: sidebar (chats + diagrams), top bar, and the routed
 * page. On md+ screens the sidebar can be resized (drag its edge, or arrow
 * keys on it) and collapsed, both remembered in this browser. Below md it is
 * a drawer opened from the top bar.
 */
export function ProjectLayout() {
  const projectId = Number(useParams().projectId)
  const navigate = useNavigate()
  const [navOpen, setNavOpen] = useState(false)
  const [collapsed, setCollapsed] = useStoredState('graphite.sidebar.collapsed', false, parseFlag)
  const [width, setWidth] = useStoredState('graphite.sidebar.width', SIDEBAR.initial, parseWidth)
  const sidebarId = useId()

  // Dragging the edge resizes from where the pointer went down. Text selection
  // is off meanwhile: a selection would turn the gesture into a native drag,
  // which cancels the pointer events.
  function startResize(event: PointerEvent) {
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const startX = event.clientX
    const startWidth = width
    const userSelect = document.body.style.userSelect
    document.body.style.userSelect = 'none'
    const widthAt = (e: globalThis.PointerEvent) => clampWidth(startWidth + e.clientX - startX)
    const move = (e: globalThis.PointerEvent) => setWidth(widthAt(e))
    const stop = (e: globalThis.PointerEvent) => {
      if (e.type === 'pointerup') setWidth(widthAt(e))
      document.body.style.userSelect = userSelect
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }

  function resizeWithKeys(event: ReactKeyboardEvent) {
    const next = {
      ArrowLeft: width - SIDEBAR.step,
      ArrowRight: width + SIDEBAR.step,
      Home: SIDEBAR.min,
      End: SIDEBAR.max,
    }[event.key]
    if (next === undefined) return
    event.preventDefault()
    setWidth(clampWidth(next))
  }

  useEffect(() => {
    if (!navOpen) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setNavOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [navOpen])

  // Choosing a page in the drawer closes it.
  function closeOnLink(event: MouseEvent) {
    if ((event.target as Element).closest('a')) setNavOpen(false)
  }
  // undefined while loading, null when the project doesn't exist.
  const project = useLiveQuery(async () => (await db.projects.get(projectId)) ?? null, [projectId])
  const sessions = useLiveQuery(
    () => db.chatSessions.where({ projectId }).reverse().sortBy('id'),
    [projectId],
  )
  const diagrams = useLiveQuery(() => db.diagrams.where({ projectId }).toArray(), [projectId])

  async function newChat() {
    const id = await db.chatSessions.add({ projectId, title: NEW_CHAT_TITLE, draft: '' })
    setNavOpen(false)
    navigate(`/projects/${projectId}/chats/${id}`)
  }

  if (project === null) return <NotFound what="Project" />

  return (
    <div className="flex h-svh bg-white dark:bg-zinc-950">
      {navOpen && (
        <div aria-hidden="true" onClick={() => setNavOpen(false)} className="fixed inset-0 z-30 bg-black/40 md:hidden" />
      )}
      <aside
        id={sidebarId}
        data-collapsed={collapsed}
        onClick={closeOnLink}
        style={{ '--sidebar-width': `${width}px` } as CSSProperties}
        className={`fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] shrink-0 flex-col gap-4 border-r border-zinc-200 bg-zinc-50 p-3 transition-transform duration-200 md:relative md:w-(--sidebar-width) md:max-w-none md:translate-x-0 dark:border-zinc-800 dark:bg-zinc-900 ${
          navOpen ? 'translate-x-0 shadow-xl' : 'max-md:invisible -translate-x-full'
        } ${collapsed ? 'md:hidden' : ''}`}
      >
        <div className="flex items-center justify-between gap-2 pl-2">
          <Brand />
          {!collapsed && (
            <button
              type="button"
              aria-label="Collapse sidebar"
              onClick={() => setCollapsed(true)}
              className={`${iconButton} max-md:hidden`}
            >
              <PanelIcon />
            </button>
          )}
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

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          aria-controls={sidebarId}
          aria-valuenow={width}
          aria-valuemin={SIDEBAR.min}
          aria-valuemax={SIDEBAR.max}
          tabIndex={0}
          onPointerDown={startResize}
          onKeyDown={resizeWithKeys}
          className="absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize touch-none outline-none hover:bg-zinc-300/60 focus-visible:bg-zinc-400/60 max-md:hidden dark:hover:bg-zinc-700/60"
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-zinc-200 px-4 md:px-6 dark:border-zinc-800">
          <button
            type="button"
            aria-label="Navigation"
            aria-expanded={navOpen}
            aria-controls={sidebarId}
            onClick={() => setNavOpen(!navOpen)}
            className="-ml-1 grid size-9 shrink-0 place-items-center rounded-lg text-zinc-600 hover:bg-zinc-100 md:hidden dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M3 5h14M3 10h14M3 15h14" strokeLinecap="round" />
            </svg>
          </button>
          {collapsed && (
            <button
              type="button"
              aria-label="Expand sidebar"
              onClick={() => setCollapsed(false)}
              className={`${iconButton} -ml-1 max-md:hidden`}
            >
              <PanelIcon />
            </button>
          )}
          {project && (
            <>
              <EditableTitle
                as="h1"
                value={project.name}
                noun="project"
                fieldLabel="Project name"
                onSave={async (name) => {
                  await db.projects.update(projectId, { name })
                }}
                className="font-medium text-zinc-900 dark:text-zinc-50"
              />
              <div className="ml-auto shrink-0">
                <ConfirmDelete
                  noun="project"
                  detail="and all its chats and diagrams"
                  onConfirm={async () => {
                    await deleteProject(projectId)
                    navigate('/')
                  }}
                />
              </div>
            </>
          )}
        </header>
        <main className="min-h-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function PanelIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
      <path d="M7.5 3.5v13" />
    </svg>
  )
}
