import { Link } from 'react-router'

export function NotFound({ what = 'Page' }: { what?: string }) {
  return (
    <div className="grid h-full min-h-60 place-items-center p-6 text-center">
      <div>
        <p className="font-medium text-zinc-900 dark:text-zinc-50">{what} not found</p>
        <Link to="/" className="mt-2 inline-block text-sm text-zinc-500 underline dark:text-zinc-400">
          Back to projects
        </Link>
      </div>
    </div>
  )
}
