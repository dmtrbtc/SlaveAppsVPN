import { createHashRouter, RouterProvider, Navigate } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { OnboardingPage } from '../pages/OnboardingPage'
import { DashboardPage } from '../pages/DashboardPage'
import { ServersPage } from '../pages/ServersPage'
import { RoutingPage } from '../pages/RoutingPage'
import { DnsPage } from '../pages/DnsPage'
import { DiagnosticsPage } from '../pages/DiagnosticsPage'
import { SettingsPage } from '../pages/SettingsPage'
import { SubscriptionsPage } from '../pages/SubscriptionsPage'
import { CabinetPage } from '../pages/CabinetPage'
import { useAuthStore } from '../stores/auth.store'

function ProtectedShell() {
  const hasAccess = useAuthStore(s => s.hasAccess)
  if (!hasAccess) return <Navigate to="/onboarding" replace />
  return <AppShell />
}

const router = createHashRouter([
  {
    path: '/onboarding',
    element: <OnboardingPage />,
  },
  {
    // Keep /login for backwards compatibility (deep links, bookmarks)
    path: '/login',
    element: <Navigate to="/onboarding" replace />,
  },
  {
    // Standalone cabinet login — reachable from onboarding BEFORE the user has
    // any access (so they can sign in and auto-import their subscription).
    path: '/cabinet-login',
    element: <CabinetPage />,
  },
  {
    element: <ProtectedShell />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: '/dashboard', element: <DashboardPage /> },
      { path: '/servers', element: <ServersPage /> },
      { path: '/subscriptions', element: <SubscriptionsPage /> },
      { path: '/routing', element: <RoutingPage /> },
      { path: '/dns', element: <DnsPage /> },
      { path: '/diagnostics', element: <DiagnosticsPage /> },
      { path: '/cabinet', element: <CabinetPage /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
