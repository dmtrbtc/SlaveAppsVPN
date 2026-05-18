import { cn } from '../../lib/utils'

interface SectionProps {
  label: string
  icon?: React.ReactNode
  className?: string
  children: React.ReactNode
}

export function Section({ label, icon, className, children }: SectionProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center gap-1.5 px-1">
        {icon && <span className="text-text-muted">{icon}</span>}
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">
          {label}
        </span>
      </div>
      {children}
    </div>
  )
}
