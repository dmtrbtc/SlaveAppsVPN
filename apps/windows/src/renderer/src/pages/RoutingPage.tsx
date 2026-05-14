import { useState } from 'react'
import { motion } from 'framer-motion'
import { Globe, Shield, SplitSquareVertical, Settings2, Check } from 'lucide-react'
import { Card } from '../components/ui/card'
import { cn } from '../lib/utils'
import { useVpnStore } from '../stores/vpn.store'
import { useUIStore } from '../stores/ui.store'
import type { VPNMode } from '@slave-vpn/shared'

interface ModeOption {
  mode: VPNMode
  Icon: React.ComponentType<{ className?: string }>
  label: string
  description: string
  tags: string[]
  recommended?: boolean
}

const MODES: ModeOption[] = [
  {
    mode: 'bypass',
    Icon: Shield,
    label: 'Обход блокировок',
    description: 'Трафик к заблокированным сервисам идёт через VPN. Остальное — напрямую. Оптимальная скорость.',
    tags: ['Рекомендовано', 'Россия'],
    recommended: true,
  },
  {
    mode: 'full',
    Icon: Globe,
    label: 'Полный VPN',
    description: 'Весь трафик идёт через VPN. Максимальная анонимность, но скорость ниже.',
    tags: ['Максимальная защита'],
  },
  {
    mode: 'split',
    Icon: SplitSquareVertical,
    label: 'Раздельный туннель',
    description: 'Вы сами указываете приложения или домены, трафик которых идёт через VPN.',
    tags: ['Гибко', 'Ручная настройка'],
  },
  {
    mode: 'custom',
    Icon: Settings2,
    label: 'Кастомный',
    description: 'Полная свобода: импорт правил, кастомные провайдеры, ручной приоритет.',
    tags: ['Продвинутый'],
  },
]

const PRIORITY_BANDS = [
  { range: '0–999', label: 'Процессы', color: 'bg-accent/20 text-text-accent' },
  { range: '1000–1999', label: 'Пользователь', color: 'bg-connected/20 text-connected' },
  { range: '2000–2999', label: 'Провайдер', color: 'bg-connecting/20 text-connecting' },
  { range: '3000–3999', label: 'GeoIP/GeoSite', color: 'bg-text-muted/20 text-text-muted' },
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
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="px-6 py-5">
        <h1 className="text-sm font-semibold text-text-primary mb-1">Маршрутизация</h1>
        <p className="text-xs text-text-muted">Выберите режим обработки трафика</p>
      </div>

      <div className="flex flex-col gap-2.5 px-4 pb-4">
        {MODES.map((option, i) => {
          const isSelected = status.mode === option.mode
          return (
            <motion.div
              key={option.mode}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.22 }}
            >
              <Card
                className={cn(
                  'cursor-pointer transition-all duration-200',
                  'hover:bg-bg-elevated active:scale-[0.99]',
                  isSelected
                    ? 'ring-1 ring-accent/50 bg-accent/5'
                    : 'opacity-80 hover:opacity-100',
                  isChanging && 'pointer-events-none opacity-50'
                )}
                onClick={() => void handleModeChange(option.mode)}
              >
                <div className="flex items-start gap-3">
                  <div className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg mt-0.5',
                    isSelected ? 'bg-accent/20' : 'bg-bg-secondary'
                  )}>
                    <option.Icon className={cn(
                      'h-4 w-4',
                      isSelected ? 'text-accent' : 'text-text-muted'
                    )} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn(
                        'text-sm font-medium',
                        isSelected ? 'text-text-primary' : 'text-text-secondary'
                      )}>
                        {option.label}
                      </span>
                      {isSelected && <Check className="h-3.5 w-3.5 text-accent" />}
                    </div>
                    <p className="text-[11px] text-text-muted leading-relaxed mb-2">
                      {option.description}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {option.tags.map(tag => (
                        <span
                          key={tag}
                          className={cn(
                            'text-[10px] px-1.5 py-0.5 rounded-md font-medium',
                            option.recommended && tag === 'Рекомендовано'
                              ? 'bg-connected/15 text-connected'
                              : 'bg-bg-secondary text-text-muted'
                          )}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          )
        })}
      </div>

      {/* Rule priority bands info */}
      <div className="px-4 pb-6">
        <div className="rounded-xl border border-border/50 bg-bg-primary px-4 py-3">
          <p className="text-[11px] font-medium text-text-secondary mb-2.5 uppercase tracking-wider">
            Приоритеты правил
          </p>
          <div className="flex flex-col gap-1.5">
            {PRIORITY_BANDS.map(band => (
              <div key={band.range} className="flex items-center gap-2">
                <span className={cn(
                  'text-[10px] font-mono px-1.5 py-0.5 rounded-md min-w-[72px] text-center',
                  band.color
                )}>
                  {band.range}
                </span>
                <span className="text-[11px] text-text-muted">{band.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
