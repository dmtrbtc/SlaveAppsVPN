import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { TitleBar } from './TitleBar'
import { Sidebar } from './Sidebar'
import { MobileNav } from './MobileNav'
import { OfflineBanner } from './OfflineBanner'
import { SafeModeBanner } from './SafeModeBanner'
import { NotificationStack } from '../notifications/NotificationStack'
import { WhatsNewModal } from '../update/WhatsNewModal'
import { ClipboardSuggestionBanner } from '../subscriptions/ClipboardSuggestionBanner'
import { useSubscriptionsStore } from '../../stores/subscriptions.store'
import { useAndroidConnectionHealth } from '../../hooks/useAndroidConnectionHealth'
import { IS_MOBILE } from '../../lib/platform'

export function AppShell() {
  const initSubs = useSubscriptionsStore(s => s.init)
  const disposeSubs = useSubscriptionsStore(s => s.dispose)
  useEffect(() => {
    initSubs()
    return () => disposeSubs()
  }, [initSubs, disposeSubs])

  // Android: synthesize real connection health from a through-tunnel url-test
  // (no-op on Windows / while disconnected). Drives the quality badge.
  useAndroidConnectionHealth()

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
        <WhatsNewModal />
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
      <WhatsNewModal />
    </div>
  )
}
