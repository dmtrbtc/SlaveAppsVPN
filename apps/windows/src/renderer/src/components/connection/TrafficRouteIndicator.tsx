import { useNavigate } from 'react-router-dom'
import { Globe, Shield, SplitSquareVertical, Settings2, ChevronRight, type LucideIcon } from 'lucide-react'
import { useVpnStore, selectVpnStatus } from '../../stores/vpn.store'
import { cn } from '../../lib/utils'

// «Куда идёт трафик» — a glanceable indicator of the active VPN mode and what it
// does. The mode is set on the Маршрутизация tab; this is read-only and taps
// through to it. Mirrors the mode model from RoutingPage / resolveRoutingPolicyForMode.

interface ModeInfo {
  label: string
  icon: LucideIcon
  /** Short behaviour line. */
  summary: string
  /** Optional split view: [left intent, right intent]. */
  flow?: { left: string; right: string }
}

const MODE_INFO: Record<string, ModeInfo> = {
  full: {
    label: 'Полный VPN',
    icon: Globe,
    summary: 'Весь трафик идёт через VPN',
  },
  bypass: {
    label: 'Обход',
    icon: Shield,
    summary: 'Российские сайты — напрямую, остальное — через VPN',
    flow: { left: '🇷🇺 РФ → напрямую', right: '🌍 Мир → VPN' },
  },
  split: {
    label: 'Раздельный',
    icon: SplitSquareVertical,
    summary: 'Через VPN идут только выбранные приложения',
  },
  custom: {
    label: 'Свой',
    icon: Settings2,
    summary: 'Маршрутизация по вашим сценариям',
  },
}

export function TrafficRouteIndicator() {
  const navigate = useNavigate()
  const status = useVpnStore(selectVpnStatus)
  const info = MODE_INFO[status.mode] ?? MODE_INFO.bypass!
  const Icon = info.icon

  return (
    <button
      onClick={() => navigate('/routing')}
      className="group w-full text-left rounded-lg border border-border bg-bg-primary p-3 transition-colors hover:border-border-strong"
      title="Изменить режим маршрутизации"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/12">
          <Icon className="h-4 w-4 text-accent" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">Режим</span>
            <span className="text-[12px] font-semibold text-text-primary">{info.label}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-text-muted leading-snug truncate">{info.summary}</p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-text-muted transition-colors group-hover:text-text-secondary" />
      </div>

      {info.flow && (
        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          <FlowChip text={info.flow.left} tone="direct" />
          <FlowChip text={info.flow.right} tone="vpn" />
        </div>
      )}
    </button>
  )
}

function FlowChip({ text, tone }: { text: string; tone: 'direct' | 'vpn' }) {
  return (
    <span
      className={cn(
        'rounded-md px-2 py-1 text-[10px] font-medium text-center truncate',
        tone === 'vpn' ? 'bg-accent/10 text-accent' : 'bg-bg-secondary text-text-secondary',
      )}
    >
      {text}
    </span>
  )
}
