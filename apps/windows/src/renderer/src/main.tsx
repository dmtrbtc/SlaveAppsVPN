import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'

window.onerror = (_message, _source, _lineno, _colno, error) => {
  console.error('[renderer] Uncaught error:', error)
}

window.onunhandledrejection = (event: PromiseRejectionEvent) => {
  console.error('[renderer] Unhandled rejection:', event.reason)
}

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element not found')

createRoot(rootEl).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
