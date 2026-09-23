import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { installAndroidBridgeIfNeeded } from './android'
import './index.css'

console.log('[renderer] bootstrap start', { bridge: typeof window.slaveVPN, time: Date.now() })

window.onerror = (_message, source, lineno, colno, error) => {
  console.error('[renderer] Uncaught error:', error?.message ?? _message, { source, lineno, colno })
}

window.onunhandledrejection = (event: PromiseRejectionEvent) => {
  console.error('[renderer] Unhandled rejection:', event.reason)
}

const rootEl = document.getElementById('root')
if (!rootEl) {
  console.error('[renderer] FATAL: #root element not found in DOM')
  throw new Error('Root element not found')
}

// Activate the Android bridge before rendering so window.slaveVPN exists
// by the time the first hook reads it. On Windows this is a no-op (the
// Electron preload already populated window.slaveVPN).
try {
  installAndroidBridgeIfNeeded()
} catch (err) {
  console.error('[renderer] Android bridge install failed', err)
}
console.log('[renderer] React render start', { bridge: typeof window.slaveVPN })
createRoot(rootEl).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
console.log('[renderer] React render scheduled')
