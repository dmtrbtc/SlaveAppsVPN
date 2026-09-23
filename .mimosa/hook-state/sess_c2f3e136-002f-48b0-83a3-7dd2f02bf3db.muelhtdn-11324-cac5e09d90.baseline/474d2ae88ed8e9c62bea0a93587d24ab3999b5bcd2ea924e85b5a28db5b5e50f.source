import { Card } from './card'

interface InfoTileProps {
  icon?: React.ReactNode
  label: string
  value: string
}

export function InfoTile({ icon, label, value }: InfoTileProps) {
  return (
    <Card className="flex items-center gap-2 py-2">
      {icon && <span className="text-text-muted shrink-0">{icon}</span>}
      <div className="min-w-0">
        <p className="text-[10px] text-text-muted">{label}</p>
        <p className="text-xs text-text-primary font-medium truncate" title={value}>{value}</p>
      </div>
    </Card>
  )
}
