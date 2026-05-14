import { createHashRouter, RouterProvider, Navigate } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { LoginPage } from '../pages/LoginPage'
import { DashboardPage } from '../pages/DashboardPage'
import { ServersPage } from '../pages/ServersPage'
import { RoutingPage } from '../pages/RoutingPage'
import { DnsPage } from '../pages/DnsPage'
import { DiagnosticsPage } from '../pages/DiagnosticsPage'
import { SettingsPage } from '../pages/SettingsPage'
import { useAuthStore } from '../stores/auth.store'

function ProtectedShell() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <AppShell />
}

const router = createHashRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    element: <ProtectedShell />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: '/dashboard', element: <DashboardPage /> },
      { path: '/servers', element: <ServersPage /> },
      { path: '/routing', element: <RoutingPage /> },
      { path: '/dns', element: <DnsPage /> },
      { path: '/diagnostics', element: <DiagnosticsPage /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
