import type { RouteObject } from 'react-router'
import { ChatPage } from './pages/ChatPage.tsx'
import { DiagramPage } from './pages/DiagramPage.tsx'
import { NotFound } from './pages/NotFound.tsx'
import { ProjectHome } from './pages/ProjectHome.tsx'
import { ProjectLayout } from './pages/ProjectLayout.tsx'
import { ProjectsPage } from './pages/ProjectsPage.tsx'

// Shared by the browser router (App.tsx) and the memory router in tests.
export const routes: RouteObject[] = [
  { path: '/', element: <ProjectsPage /> },
  {
    path: '/projects/:projectId',
    element: <ProjectLayout />,
    children: [
      { index: true, element: <ProjectHome /> },
      { path: 'chats/:chatId', element: <ChatPage /> },
      { path: 'diagrams/:diagramId', element: <DiagramPage /> },
    ],
  },
  { path: '*', element: <NotFound /> },
]
