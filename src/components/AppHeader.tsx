import { Link } from 'react-router'
import { Brand } from './Brand.tsx'
import { SettingsIcon } from './SettingsIcon.tsx'

/** Top bar for the pages outside a project: brand on the left, settings on the right. */
export function AppHeader() {
  return (
    <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 sm:px-6 sm:py-4 dark:border-zinc-800 dark:bg-zinc-900">
      <Brand />
      <Link
        to="/settings"
        className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      >
        <SettingsIcon />
        Settings
      </Link>
    </header>
  )
}
