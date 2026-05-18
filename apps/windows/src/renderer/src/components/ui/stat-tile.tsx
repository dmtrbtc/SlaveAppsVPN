import { cn } from '../../lib/utils'

interface StatTileProps {
  label: string
  value: React.ReactNode
  sub?: string
  icon?: React.ReactNode
  accent?: boolean
  mono?: boolean
  className?: string
}

export function StatTile({ label, value, sub, icon, accent, mono, className }: StatTileProps) {
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">
        {icon && <span>{icon}</span>}
        {label}
      </div>
      <div
        className={cn(
          'text-[18px] font-semibold leading-tight',
          mono && 'font-mono tabular-nums',
          accent ? 'text-accent' : 'text-text-primary'
        )}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-text-muted leading-tight">{sub}</div>}
    </div>
  )
}
