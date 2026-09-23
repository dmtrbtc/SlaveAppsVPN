import { AlertCircle, RefreshCw, X } from 'lucide-react'
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

// ─── ListSkeleton ─────────────────────────────────────────────────────────────
// Placeholder rows with a sweep shimmer (Aurora spec → List states). Each row is
// progressively fainter. Use while a list (Servers / Subscriptions / Logs …)
// loads, instead of a bare spinner.

interface ListSkeletonProps {
  rows?: number
  className?: string
}

function SkeletonRow({ opacity }: { opacity: number }) {
  return (
    <div
      className="relative flex items-center gap-3 overflow-hidden rounded-lg border border-border bg-bg-primary p-3"
      style={{ opacity }}
      aria-hidden="true"
    >
      <div className="h-9 w-9 shrink-0 rounded-full bg-bg-secondary" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-1/3 rounded bg-bg-secondary" />
        <div className="h-2.5 w-1/2 rounded bg-bg-secondary" />
      </div>
      <div className="h-6 w-14 shrink-0 rounded-md bg-bg-secondary" />
      {/* sweep shimmer */}
      <div className="pointer-events-none absolute inset-0 animate-sweep bg-gradient-to-r from-transparent via-white/40 to-transparent dark:via-white/10" />
    </div>
  )
}

export function ListSkeleton({ rows = 4, className }: ListSkeletonProps) {
  return (
    <div className={cn('space-y-2', className)} aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} opacity={Math.max(0.25, 1 - i * 0.16)} />
      ))}
    </div>
  )
}

// ─── Banner ───────────────────────────────────────────────────────────────────
// Inline tone strip (icon + title/sub + action + optional close). Aurora spec →
// List states / Banner. Used e.g. by the Dashboard update banner.

type BannerTone = 'accent' | 'ok' | 'warn' | 'bad'

interface BannerProps {
  tone?: BannerTone
  icon?: React.ReactNode
  title: string
  sub?: string
  action?: React.ReactNode
  onClose?: () => void
  className?: string
}

const BANNER_TONE: Record<BannerTone, string> = {
  accent: 'bg-accent/12 border-accent/20',
  ok: 'bg-connected/12 border-connected/25',
  warn: 'bg-connecting/12 border-connecting/25',
  bad: 'bg-error/12 border-error/20',
}

const BANNER_ICON_TONE: Record<BannerTone, string> = {
  accent: 'text-accent',
  ok: 'text-connected',
  warn: 'text-connecting',
  bad: 'text-error',
}

export function Banner({ tone = 'accent', icon, title, sub, action, onClose, className }: BannerProps) {
  return (
    <div
      className={cn('flex items-center gap-3 rounded-lg border px-4 py-2.5', BANNER_TONE[tone], className)}
      role="status"
    >
      {icon && <span className={cn('shrink-0', BANNER_ICON_TONE[tone])}>{icon}</span>}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-text-primary">{title}</p>
        {sub && <p className="mt-0.5 text-[12px] text-text-secondary">{sub}</p>}
      </div>
      {action}
      {onClose && (
        <button
          onClick={onClose}
          className="shrink-0 rounded-md p-1 text-text-muted transition-colors hover:bg-bg-secondary hover:text-text-primary"
          aria-label="Закрыть"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
