import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { TitleBar } from './TitleBar'
import { Sidebar } from './Sidebar'
import { MobileNav } from './MobileNav'
import { OfflineBanner } from './OfflineBanner'
import { SafeModeBanner } from './SafeModeBanner'
import { NotificationStack } from '../notifications/NotificationStack'
import { ClipboardSuggestionBanner } from '../subscriptions/ClipboardSuggestionBanner'
import { useSubscriptionsStore } from '../../stores/subscriptions.store'
import { IS_MOBILE } from '../../lib/platform'

export function AppShell() {
  const initSubs = useSubscriptionsStore(s => s.init)
  const disposeSubs = useSubscriptionsStore(s => s.dispose)
  useEffect(() => {
    initSubs()
    return () => disposeSubs()
  }, [initSubs, disposeSubs])

  if (IS_MOBILE) {
    return (
      <div
        className="flex h-full flex-col bg-bg-base"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <SafeModeBanner />
        <main className="relative flex-1 overflow-y-auto overflow-x-hidden">
          <Outlet />
          <ClipboardSuggestionBanner />
          <OfflineBanner />
        </main>
        <MobileNav />
        <NotificationStack />
      </div>
    )
  }

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
