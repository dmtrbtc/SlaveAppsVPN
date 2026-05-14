import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-bg-tertiary text-text-secondary border border-border',
        accent: 'bg-accent/15 text-text-accent border border-accent/25',
        connected: 'bg-connected/15 text-connected border border-connected/25',
        connecting: 'bg-connecting/15 text-connecting border border-connecting/25',
        error: 'bg-error/15 text-error border border-error/25',
        protocol: 'bg-bg-elevated text-text-secondary border border-border font-mono uppercase tracking-wider text-[10px]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean
}

export function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, className }))} {...props}>
      {dot && (
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            variant === 'connected' && 'bg-connected',
            variant === 'connecting' && 'bg-connecting animate-pulse',
            variant === 'error' && 'bg-error',
            variant === 'accent' && 'bg-accent',
            !variant || variant === 'default' && 'bg-text-muted',
          )}
        />
      )}
      {children}
    </span>
  )
}
