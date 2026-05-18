import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
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

console.log('[renderer] React render start')
createRoot(rootEl).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
console.log('[renderer] React render scheduled')
