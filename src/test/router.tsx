import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { expect, vi } from 'vitest'
import { routes } from '../routes.tsx'

type Router = ReturnType<typeof createMemoryRouter>

/** Renders the app's routes in a memory router, starting at `path`. */
export function renderAt(path: string): Router {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

/** Waits for `router` to reach `path`; navigation often follows an async Dexie write. */
export function expectPath(router: Router, path: string) {
  return vi.waitFor(() => expect(router.state.location.pathname).toBe(path))
}
