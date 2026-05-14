import { Outlet } from 'react-router-dom'
import { TitleBar } from './TitleBar'
import { Sidebar } from './Sidebar'
import { NotificationStack } from '../notifications/NotificationStack'

export function AppShell() {
  return (
    <div className="flex h-full flex-col bg-bg-base">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden relative">
          <Outlet />
        </main>
      </div>
      <NotificationStack />
    </div>
  )
}
