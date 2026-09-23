import { cn } from '../../lib/utils'
import { Spinner } from './spinner'

interface ToggleRowProps {
  label: string
  description?: string
  sub?: string
  value: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  loading?: boolean
}

export function ToggleRow({ label, description, sub, value, onChange, disabled, loading }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-text-primary">{label}</p>
        {(description ?? sub) && (
          <p className="text-[11px] text-text-muted mt-0.5">{description ?? sub}</p>
        )}
      </div>
      {loading ? (
        <Spinner size="sm" />
      ) : (
        <button
          onClick={() => !disabled && onChange(!value)}
          disabled={disabled}
          className={cn(
            'relative h-5 w-9 rounded-full transition-colors duration-200 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 no-drag',
            value ? 'bg-accent' : 'bg-bg-secondary border border-border-strong',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
          aria-checked={value}
          role="switch"
        >
          <span className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-200',
            value ? 'left-[calc(100%-1.125rem)]' : 'left-0.5'
          )} />
        </button>
      )}
    </div>
  )
}
