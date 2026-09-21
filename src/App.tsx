import { createBrowserRouter, RouterProvider } from 'react-router'
import { routes } from './routes.tsx'

const router = createBrowserRouter(routes)

function App() {
  return <RouterProvider router={router} />
}

export default App
