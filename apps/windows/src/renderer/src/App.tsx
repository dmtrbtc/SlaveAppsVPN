import { useEffect, useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/query-client'
import { events } from './lib/api'
import { AppRouter } from './router/AppRouter'
import { useAuthStore } from './stores/auth.store'
import { useVpnStore } from './stores/vpn.store'
import { useUIStore, type ThemeMode } from './stores/ui.store'
import { useDiagnosticsStore } from './stores/diagnostics.store'
import { Spinner } from './components/ui/spinner'

function useTheme(mode: ThemeMode) {
  useEffect(() => {
    const apply = (dark: boolean) => {
      document.documentElement.classList.toggle('dark', dark)
    }

    if (mode === 'dark') { apply(true); return }
    if (mode === 'light') { apply(false); return }

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    apply(mq.matches)
    const handler = (e: MediaQueryListEvent) => apply(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [mode])
}

const BOOTSTRAP_TIMEOUT_MS = 30_000
const NOOP_UNSUB = (): void => {}

function Bootstrap({ children }: { children: React.ReactNode }) {
  const { isBootstrapping, bootstrap, subscribeToAuthEvents } = useAuthStore()
  const { fetchStatus, subscribeToEvents } = useVpnStore()
  const { notify } = useUIStore()
  const { subscribeToEvents: subscribeToDiagnostics } = useDiagnosticsStore()
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    void bootstrap()
    const timer = setTimeout(() => setTimedOut(true), BOOTSTRAP_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [bootstrap])

  useEffect(() => {
    if (isBootstrapping && !timedOut) return
    void fetchStatus()

    let unsubVpn = NOOP_UNSUB
    let unsubAuth = NOOP_UNSUB
    let unsubDiag = NOOP_UNSUB
    let unsubNotif = NOOP_UNSUB

    try {
      unsubVpn = subscribeToEvents()
      unsubAuth = subscribeToAuthEvents()
      unsubDiag = subscribeToDiagnostics()
      unsubNotif = events.onNotification(payload => {
        notify({ type: payload.type, title: payload.title, message: payload.body })
      })
    } catch (err) {
      console.error('[Bootstrap] Event subscription failed:', err)
    }

    return () => {
      unsubVpn()
      unsubAuth()
      unsubDiag()
      unsubNotif()
    }
  }, [isBootstrapping, timedOut, fetchStatus, subscribeToEvents, subscribeToAuthEvents, subscribeToDiagnostics, notify])

  if (isBootstrapping && !timedOut) {
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

function ThemeProvider() {
  const themeMode = useUIStore(s => s.themeMode)
  useTheme(themeMode)
  return null
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider />
      <Bootstrap>
        <AppRouter />
      </Bootstrap>
    </QueryClientProvider>
  )
}
