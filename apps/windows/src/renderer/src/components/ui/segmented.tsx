import { cn } from '../../lib/utils'

interface SegmentedOption<T extends string> {
  value: T
  label: string
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  size?: 'sm' | 'md'
  className?: string
  disabled?: boolean
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className,
  disabled = false,
}: SegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-disabled={disabled || undefined}
      className={cn(
        'inline-flex rounded-md border border-border bg-bg-secondary p-0.5 gap-0.5',
        className
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded font-medium transition-all duration-150 no-drag',
              size === 'sm' ? 'px-2.5 py-0.5 text-[11px]' : 'px-3 py-1 text-[12px]',
              active
                ? 'bg-bg-primary text-text-primary shadow-sm'
                : cn('text-text-muted', !disabled && 'hover:text-text-secondary'),
              disabled && 'cursor-not-allowed'
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
