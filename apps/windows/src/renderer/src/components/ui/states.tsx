import { AlertCircle, RefreshCw } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Spinner } from './spinner'
import { Button } from './button'

// ─── LoadingState ─────────────────────────────────────────────────────────────

interface LoadingStateProps {
  className?: string
  label?: string
}

export function LoadingState({ className, label }: LoadingStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-12', className)}>
      <Spinner />
      {label && <p className="text-xs text-text-muted">{label}</p>}
    </div>
  )
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon?: React.ReactNode
  label: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon, label, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-12 text-center', className)}>
      {icon && <div className="text-text-muted opacity-50">{icon}</div>}
      <div>
        <p className="text-sm font-medium text-text-secondary">{label}</p>
        {description && <p className="text-xs text-text-muted mt-0.5">{description}</p>}
      </div>
      {action}
    </div>
  )
}

// ─── ErrorState ───────────────────────────────────────────────────────────────

interface ErrorStateProps {
  error: Error | string | null | unknown
  retry?: () => void
  className?: string
}

export function ErrorState({ error, retry, className }: ErrorStateProps) {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
    ? error
    : 'Неизвестная ошибка'

  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-12 text-center', className)}>
      <AlertCircle className="h-8 w-8 text-error opacity-70" />
      <div>
        <p className="text-sm font-medium text-text-secondary">Ошибка загрузки</p>
        <p className="text-xs text-text-muted mt-0.5 max-w-[200px] leading-relaxed">{message}</p>
      </div>
      {retry && (
        <Button variant="outline" size="sm" onClick={retry}>
          <RefreshCw className="h-3.5 w-3.5" />
          Повторить
        </Button>
      )}
    </div>
  )
}
