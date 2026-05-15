import { useEffect } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/query-client'
import { events } from './lib/api'
import { AppRouter } from './router/AppRouter'
import { useAuthStore } from './stores/auth.store'
import { useVpnStore } from './stores/vpn.store'
import { useUIStore } from './stores/ui.store'
import { Spinner } from './components/ui/spinner'

function Bootstrap({ children }: { children: React.ReactNode }) {
  const { isBootstrapping, bootstrap, subscribeToAuthEvents } = useAuthStore()
  const { fetchStatus, subscribeToEvents } = useVpnStore()
  const { notify } = useUIStore()

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  useEffect(() => {
    if (isBootstrapping) return
    void fetchStatus()
    const unsubVpn = subscribeToEvents()
    const unsubAuth = subscribeToAuthEvents()
    const unsubNotif = events.onNotification(payload => {
      notify({ type: payload.type, title: payload.title, message: payload.body })
    })
    return () => {
      unsubVpn()
      unsubAuth()
      unsubNotif()
    }
  }, [isBootstrapping, fetchStatus, subscribeToEvents, subscribeToAuthEvents, notify])

  if (isBootstrapping) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-bg-base">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15">
          <Spinner />
        </div>
        <p className="text-xs text-text-muted">Инициализация...</p>
      </div>
    )
  }

  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Bootstrap>
        <AppRouter />
      </Bootstrap>
    </QueryClientProvider>
  )
}
