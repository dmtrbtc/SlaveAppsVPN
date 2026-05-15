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
      <div className="flex items-center gap-1.5 text-[11px] text-text-muted uppercase tracking-wider px-1">
        {icon}
        {label}
      </div>
      {children}
    </div>
  )
}
