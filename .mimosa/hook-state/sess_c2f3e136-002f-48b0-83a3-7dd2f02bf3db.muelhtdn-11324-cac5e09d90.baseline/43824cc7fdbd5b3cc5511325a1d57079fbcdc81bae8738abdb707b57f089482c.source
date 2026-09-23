import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
    mutations: {
      retry: 0,
    },
  },
})

// Server queries use the platform bridge (IPC / Capacitor), not WebView fetch.
// Android can keep navigator.onLine=false after a VPN transition despite working
// native networking. Pausing here would strand ServersPage's refetch before its
// subsequent probeAll call. Let the bridge return data or its real network error.
// Scope this to server queries; do not override global browser connectivity.
queryClient.setQueryDefaults(['servers'], { networkMode: 'always' })
