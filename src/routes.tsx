import type { RouteObject } from 'react-router'
import { ChatPage } from './pages/ChatPage.tsx'
import { DiagramPage } from './pages/DiagramPage.tsx'
import { LandingPage } from './pages/LandingPage.tsx'
import { NotFound } from './pages/NotFound.tsx'
import { ProjectHome } from './pages/ProjectHome.tsx'
import { ProjectLayout } from './pages/ProjectLayout.tsx'
import { ProjectsPage } from './pages/ProjectsPage.tsx'
import { ProviderPage } from './pages/ProviderPage.tsx'
import { SettingsLayout } from './pages/SettingsLayout.tsx'
import { SettingsPage } from './pages/SettingsPage.tsx'

// Shared by the browser router (App.tsx) and the memory router in tests.
export const routes: RouteObject[] = [
  { path: '/', element: <LandingPage /> },
  { path: '/app', element: <ProjectsPage /> },
  {
    path: '/app/projects/:projectId',
    element: <ProjectLayout />,
    children: [
      { index: true, element: <ProjectHome /> },
      { path: 'chats/:chatId', element: <ChatPage /> },
      { path: 'diagrams/:diagramId', element: <DiagramPage /> },
    ],
  },
  {
    path: '/app/settings',
    element: <SettingsLayout />,
    children: [
      { index: true, element: <SettingsPage /> },
      { path: 'providers/new/:kind', element: <ProviderPage /> },
      { path: 'providers/:providerId', element: <ProviderPage /> },
    ],
  },
  { path: '*', element: <NotFound /> },
]
