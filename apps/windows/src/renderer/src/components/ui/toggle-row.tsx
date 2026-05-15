import { cn } from '../../lib/utils'
import { Spinner } from './spinner'

interface ToggleRowProps {
  label: string
  description?: string
  value: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  loading?: boolean
}

export function ToggleRow({ label, description, value, onChange, disabled, loading }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text-primary">{label}</p>
        {description && <p className="text-[11px] text-text-muted">{description}</p>}
      </div>
      {loading ? (
        <Spinner size="sm" />
      ) : (
        <button
          onClick={() => !disabled && onChange(!value)}
          disabled={disabled}
          className={cn(
            'relative h-5 w-9 rounded-full transition-colors duration-200 shrink-0',
            value ? 'bg-accent' : 'bg-bg-secondary border border-border',
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
