import { Outlet } from 'react-router-dom'
import { TitleBar } from './TitleBar'
import { Sidebar } from './Sidebar'
import { OfflineBanner } from './OfflineBanner'
import { SafeModeBanner } from './SafeModeBanner'
import { NotificationStack } from '../notifications/NotificationStack'

export function AppShell() {
  return (
    <div className="flex h-full flex-col bg-bg-base">
      <TitleBar />
      <SafeModeBanner />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="relative flex-1 overflow-hidden">
          <Outlet />
          <OfflineBanner />
        </main>
      </div>
      <NotificationStack />
    </div>
  )
}
