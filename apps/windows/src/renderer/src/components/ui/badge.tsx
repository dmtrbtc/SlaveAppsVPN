import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors',
  {
    variants: {
      variant: {
        // Aurora tones
        neutral:  'bg-bg-secondary text-text-muted border border-border',
        accent:   'bg-accent/12 text-accent border border-accent/20',
        ok:       'bg-connected/12 text-connected border border-connected/25',
        warn:     'bg-connecting/12 text-connecting border border-connecting/25',
        bad:      'bg-error/12 text-error border border-error/20',
        // Legacy aliases
        default:  'bg-bg-secondary text-text-muted border border-border',
        connected:   'bg-connected/12 text-connected border border-connected/25',
        connecting:  'bg-connecting/12 text-connecting border border-connecting/25',
        error:       'bg-error/12 text-error border border-error/20',
        protocol: 'bg-bg-elevated text-text-secondary border border-border font-mono uppercase tracking-wider text-[10px]',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  }
)

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>
type AuroraTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'bad'

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean
  tone?: AuroraTone
}

export function Badge({ className, variant, tone, dot, children, ...props }: BadgeProps) {
  const resolvedVariant: BadgeVariant = (tone ?? variant ?? 'neutral') as BadgeVariant

  const dotColor =
    resolvedVariant === 'ok' || resolvedVariant === 'connected' ? 'bg-connected' :
    resolvedVariant === 'warn' || resolvedVariant === 'connecting' ? 'bg-connecting animate-pulse' :
    resolvedVariant === 'bad' || resolvedVariant === 'error' ? 'bg-error' :
    resolvedVariant === 'accent' ? 'bg-accent' :
    'bg-text-muted'

  return (
    <span className={cn(badgeVariants({ variant: resolvedVariant, className }))} {...props}>
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', dotColor)} />}
      {children}
    </span>
  )
}
