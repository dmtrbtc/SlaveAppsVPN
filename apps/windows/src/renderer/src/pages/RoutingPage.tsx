import { useState } from 'react'
import { motion } from 'framer-motion'
import { Globe, Shield, SplitSquareVertical, Settings2, Check } from 'lucide-react'
import { Badge } from '../components/ui/badge'
import { cn } from '../lib/utils'
import { useVpnStore } from '../stores/vpn.store'
import { useUIStore } from '../stores/ui.store'
import type { VPNMode } from '@slave-vpn/shared'

interface ModeOption {
  mode: VPNMode
  Icon: React.ComponentType<{ className?: string }>
  label: string
  description: string
  recommended?: boolean
}

const MODES: ModeOption[] = [
  {
    mode: 'bypass',
    Icon: Shield,
    label: 'Обход блокировок',
    description: 'Трафик к заблокированным сервисам идёт через VPN. Остальное — напрямую. Оптимальная скорость.',
    recommended: true,
  },
  {
    mode: 'full',
    Icon: Globe,
    label: 'Полный VPN',
    description: 'Весь трафик идёт через VPN. Максимальная анонимность, но скорость ниже.',
  },
  {
    mode: 'split',
    Icon: SplitSquareVertical,
    label: 'Раздельный туннель',
    description: 'Вы сами указываете приложения или домены, трафик которых идёт через VPN.',
  },
  {
    mode: 'custom',
    Icon: Settings2,
    label: 'Кастомный',
    description: 'Полная свобода: импорт правил, кастомные провайдеры, ручной приоритет.',
  },
]

const PRIORITY_BANDS = [
  { range: '0–999',    label: 'Процессы',    tone: 'accent'  as const },
  { range: '1000–1999', label: 'Пользователь', tone: 'ok'     as const },
  { range: '2000–2999', label: 'Провайдер',    tone: 'warn'   as const },
  { range: '3000–3999', label: 'GeoIP/GeoSite', tone: 'neutral' as const },
]

export function RoutingPage() {
  const { status, setMode } = useVpnStore()
  const { notify } = useUIStore()
  const [isChanging, setIsChanging] = useState(false)

  const handleModeChange = async (mode: VPNMode) => {
    if (mode === status.mode || isChanging) return
    setIsChanging(true)
    try {
      await setMode(mode)
      notify({ type: 'success', title: 'Режим изменён', message: MODES.find(m => m.mode === mode)?.label ?? mode })
    } catch (err) {
      notify({ type: 'error', title: 'Ошибка', message: String(err) })
    } finally {
      setIsChanging(false)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-bg-base">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border">
        <h2 className="text-[15px] font-semibold text-text-primary">Маршрутизация</h2>
        <p className="text-[12px] text-text-muted mt-0.5">Выберите режим обработки трафика</p>
      </div>

      <div className="flex flex-col gap-2.5 px-6 py-5">
        {/* Mode grid 2×2 */}
        <div className="grid grid-cols-2 gap-2.5">
          {MODES.map((option, i) => {
            const isSelected = status.mode === option.mode
            return (
              <motion.div
                key={option.mode}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.2 }}
              >
                <div
                  onClick={() => void handleModeChange(option.mode)}
                  className={cn(
                    'rounded-lg border p-[18px] cursor-pointer transition-all duration-200',
                    'hover:-translate-y-px',
                    isSelected
                      ? 'border-accent/40 bg-accent/5'
                      : 'border-border bg-bg-primary hover:border-border-strong hover:shadow-card',
                    isChanging && 'pointer-events-none opacity-60'
                  )}
                >
                  {/* Icon row */}
                  <div className="flex items-start justify-between mb-3">
                    <div className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                      isSelected ? 'bg-accent/15' : 'bg-bg-secondary'
                    )}>
                      <option.Icon className={cn(
                        'h-4.5 w-4.5',
                        isSelected ? 'text-accent' : 'text-text-muted'
                      )} />
                    </div>
                    <div className="flex items-center gap-1.5">
                      {option.recommended && (
                        <Badge tone="ok">Рекомендовано</Badge>
                      )}
                      {isSelected && <Check className="h-3.5 w-3.5 text-accent" />}
                    </div>
                  </div>
                  {/* Title */}
                  <p className={cn(
                    'text-[13px] font-semibold mb-1',
                    isSelected ? 'text-text-primary' : 'text-text-secondary'
                  )}>
                    {option.label}
                  </p>
                  <p className="text-[11px] text-text-muted leading-relaxed">
                    {option.description}
                  </p>
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* Priority bands card */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.2 }}
          className="rounded-lg border border-border bg-bg-primary p-4"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted mb-3">
            Приоритеты правил
          </p>
          <div className="flex flex-col gap-2">
            {PRIORITY_BANDS.map(band => (
              <div key={band.range} className="flex items-center gap-3">
                <Badge tone={band.tone} className="font-mono text-[10px] min-w-[76px] justify-center">
                  {band.range}
                </Badge>
                <span className="text-[12px] text-text-secondary">{band.label}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
