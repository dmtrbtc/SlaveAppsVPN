import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { TitleBar } from './TitleBar'
import { Sidebar } from './Sidebar'
import { OfflineBanner } from './OfflineBanner'
import { SafeModeBanner } from './SafeModeBanner'
import { NotificationStack } from '../notifications/NotificationStack'
import { ClipboardSuggestionBanner } from '../subscriptions/ClipboardSuggestionBanner'
import { useSubscriptionsStore } from '../../stores/subscriptions.store'

export function AppShell() {
  const initSubs = useSubscriptionsStore(s => s.init)
  const disposeSubs = useSubscriptionsStore(s => s.dispose)
  useEffect(() => {
    initSubs()
    return () => disposeSubs()
  }, [initSubs, disposeSubs])

  return (
    <div className="flex h-full flex-col bg-bg-base">
      <TitleBar />
      <SafeModeBanner />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="relative flex-1 overflow-hidden">
          <Outlet />
          <ClipboardSuggestionBanner />
          <OfflineBanner />
        </main>
      </div>
      <NotificationStack />
    </div>
  )
}
