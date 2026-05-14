import { forwardRef } from 'react'
import { cn } from '../../lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, icon, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label className="text-xs font-medium text-text-secondary">{label}</label>
        )}
        <div className="relative">
          {icon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            className={cn(
              'flex h-10 w-full rounded-xl border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary',
              'placeholder:text-text-muted',
              'focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'transition-all duration-150 no-drag',
              icon && 'pl-9',
              error && 'border-error focus:border-error focus:ring-error/30',
              className
            )}
            {...props}
          />
        </div>
        {error && <p className="text-xs text-error">{error}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'
