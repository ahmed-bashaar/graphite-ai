import { Outlet } from 'react-router'
import { AppHeader } from '../components/AppHeader.tsx'

export function SettingsLayout() {
  return (
    <div className="min-h-svh bg-zinc-50 dark:bg-zinc-950">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <Outlet />
      </main>
    </div>
  )
}
