import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ShieldCheck, Zap, Minimize2, Gauge, Check } from 'lucide-react'
import { Badge } from '../components/ui/badge'
import { cn } from '../lib/utils'
import { useUIStore } from '../stores/ui.store'
import { dnsApi, settingsApi } from '../lib/api'
import type { DnsPresetName, DnsStrategyName, DnsStrategyInfo } from '@shared/ipc/types'

interface DnsProfileDef {
  key: DnsPresetName
  Icon: React.ComponentType<{ className?: string }>
  label: string
  sublabel: string
  description: string
  features: string[]
  servers: string[]
  recommended?: boolean
}

const DNS_PROFILES: DnsProfileDef[] = [
  {
    key: 'secure',
    Icon: ShieldCheck,
    label: 'Безопасный',
    sublabel: 'DoH + H/3 + Fake-IP',
    description: 'Полная защита DNS. DoH с Fake-IP режимом, защита от DNS-leak. Оптимально для обхода блокировок.',
    features: ['Fake-IP', 'DNS-over-HTTPS', 'DNS-leak защита', 'No IPv6'],
    servers: ['https://8.8.8.8/dns-query', 'https://1.1.1.1/dns-query'],
    recommended: true,
  },
  {
    key: 'balanced',
    Icon: Zap,
    label: 'Сбалансированный',
    sublabel: 'DoH + UDP fallback',
    description: 'Сочетание скорости и безопасности. Fake-IP с fallback на UDP для местных доменов.',
    features: ['Fake-IP', 'DoH primary', 'UDP fallback', 'Кэширование'],
    servers: ['https://8.8.8.8/dns-query', '8.8.4.4'],
  },
  {
    key: 'performance',
    Icon: Gauge,
    label: 'Производительность',
    sublabel: 'UDP параллельный',
    description: 'Максимальная скорость разрешения. UDP-запросы параллельно к нескольким серверам.',
    features: ['Fake-IP', 'UDP параллельный', 'Мин. задержка'],
    servers: ['8.8.8.8', '1.1.1.1', '9.9.9.9'],
  },
  {
    key: 'minimal',
    Icon: Minimize2,
    label: 'Минимальный',
    sublabel: 'UDP / системный DNS',
    description: 'Минимальная конфигурация. Redir-host режим, базовые UDP-серверы. Максимальная совместимость.',
    features: ['Redir-Host', 'UDP', 'Без Fake-IP', 'Системный DNS'],
    servers: ['8.8.8.8', '1.1.1.1'],
  },
]

export function DnsPage() {
  const { notify } = useUIStore()
  const [selected, setSelected] = useState<DnsPresetName>('secure')
  const [strategy, setStrategy] = useState<DnsStrategyName>('prefer_ipv4')
  const [strategies, setStrategies] = useState<DnsStrategyInfo[]>([])
  const [isApplying, setIsApplying] = useState(false)
  const [isStrategyApplying, setIsStrategyApplying] = useState(false)

  // Load current preset + strategy from settings on mount
  useEffect(() => {
    settingsApi.get().then(s => {
      setSelected(s.dnsPreset ?? 'secure')
      setStrategy((s.dnsStrategy ?? 'prefer_ipv4') as DnsStrategyName)
    }).catch(() => {})
    dnsApi.getStrategies().then(setStrategies).catch(() => {})
  }, [])

  const handleStrategyChange = async (next: DnsStrategyName) => {
    if (next === strategy || isStrategyApplying) return
    setIsStrategyApplying(true)
    try {
      await settingsApi.set({ dnsStrategy: next })
      setStrategy(next)
      notify({ type: 'success', title: 'Стратегия обновлена', message: next })
    } catch {
      notify({ type: 'error', title: 'Ошибка', message: 'Не удалось сохранить стратегию' })
    } finally {
      setIsStrategyApplying(false)
    }
  }

  const handleSelect = async (key: DnsPresetName) => {
    if (key === selected || isApplying) return
    setIsApplying(true)
    try {
      await settingsApi.set({ dnsPreset: key })
      // Also update the dns profile via IPC (persists for next connect)
      const profile = await dnsApi.getProfile()
      if (profile.preset !== key) {
        await dnsApi.setProfile({ profile: { ...profile, preset: key } })
      }
      setSelected(key)
      const profileDef = DNS_PROFILES.find(p => p.key === key)!
      notify({ type: 'success', title: 'DNS профиль изменён', message: profileDef.label })
    } catch {
      notify({ type: 'error', title: 'Ошибка', message: 'Не удалось сохранить DNS профиль' })
    } finally {
      setIsApplying(false)
    }
  }

  const selectedProfile = DNS_PROFILES.find(p => p.key === selected)

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-bg-base">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border">
        <h2 className="text-[15px] font-semibold text-text-primary">DNS</h2>
        <p className="text-[12px] text-text-muted mt-0.5">Профиль разрешения имён</p>
      </div>

      <div className="flex flex-col gap-2.5 px-6 py-5">
        {/* Profile grid — 2×2 */}
        <div className="grid grid-cols-2 gap-2.5">
          {DNS_PROFILES.map((profile, i) => {
            const isSelected = selected === profile.key
            return (
              <motion.div
                key={profile.key}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, duration: 0.2 }}
              >
                <div
                  onClick={() => void handleSelect(profile.key)}
                  className={cn(
                    'rounded-lg border p-4 cursor-pointer transition-all duration-200 h-full',
                    'hover:-translate-y-px',
                    isSelected
                      ? 'border-accent/40 bg-accent/5'
                      : 'border-border bg-bg-primary hover:border-border-strong hover:shadow-card',
                    isApplying && 'pointer-events-none opacity-60'
                  )}
                >
                  {/* Icon + selected check */}
                  <div className="flex items-start justify-between mb-3">
                    <div className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                      isSelected ? 'bg-accent/15' : 'bg-bg-secondary'
                    )}>
                      <profile.Icon className={cn(
                        'h-4 w-4',
                        isSelected ? 'text-accent' : 'text-text-muted'
                      )} />
                    </div>
                    {isSelected && <Check className="h-3.5 w-3.5 text-accent" />}
                  </div>

                  {/* Title + recommended */}
                  <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                    <span className={cn(
                      'text-[13px] font-semibold',
                      isSelected ? 'text-text-primary' : 'text-text-secondary'
                    )}>
                      {profile.label}
                    </span>
                    {profile.recommended && <Badge tone="ok">Рекомендован</Badge>}
                  </div>

                  <p className="text-[11px] text-text-muted mb-2">{profile.sublabel}</p>
                  <p className="text-[11px] text-text-muted leading-relaxed mb-3">
                    {profile.description}
                  </p>

                  {/* Feature badges */}
                  <div className="flex flex-wrap gap-1">
                    {profile.features.map(f => (
                      <Badge key={f} tone="neutral">{f}</Badge>
                    ))}
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* Servers info card */}
        {selectedProfile && (
          <motion.div
            key={selected}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="rounded-lg border border-border bg-bg-primary p-4"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted mb-2">
              DNS-серверы — {selectedProfile.label}
            </p>
            <div className="flex flex-col gap-1">
              {selectedProfile.servers.map(s => (
                <code key={s} className="text-[11px] text-text-secondary font-mono break-all">
                  {s}
                </code>
              ))}
            </div>
            <p className="text-[11px] text-text-muted leading-relaxed mt-3">
              Изменение профиля вступает в силу при следующем подключении.
            </p>
          </motion.div>
        )}

        {/* DNS strategy (IPv4 / IPv6 preference) */}
        {strategies.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.1 }}
            className="rounded-lg border border-border bg-bg-primary p-4"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted mb-3">
              Стратегия разрешения
            </p>
            <div className="flex flex-wrap gap-2">
              {strategies.map(s => {
                const active = s.value === strategy
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => void handleStrategyChange(s.value)}
                    disabled={isStrategyApplying}
                    className={cn(
                      'rounded-md border px-3 py-1.5 text-[12px] transition-colors disabled:opacity-50',
                      active
                        ? 'border-accent/45 bg-accent/10 text-text-primary'
                        : 'border-border bg-bg-secondary text-text-secondary hover:border-border-strong',
                    )}
                  >
                    {s.label}
                  </button>
                )
              })}
            </div>
            {strategies.find(s => s.value === strategy) && (
              <p className="text-[11px] text-text-muted leading-relaxed mt-3">
                {strategies.find(s => s.value === strategy)?.description}
              </p>
            )}
          </motion.div>
        )}
      </div>
    </div>
  )
}
