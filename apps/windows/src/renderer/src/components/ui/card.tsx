import { cn } from '../../lib/utils'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  raised?: boolean
  hover?: boolean
  padding?: number
}

export function Card({ className, raised, hover, padding, style, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-bg-primary',
        raised && 'bg-bg-elevated shadow-md',
        hover && 'cursor-default transition-all duration-200 hover:-translate-y-px hover:border-border-strong hover:shadow-card',
        className
      )}
      style={{ padding: padding ?? 16, ...style }}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-3 flex items-center justify-between', className)} {...props} />
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-[15px] font-semibold text-text-primary leading-snug', className)} {...props} />
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-[12px] text-text-muted', className)} {...props} />
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(className)} {...props} />
}
