import { useState } from 'react'
import { motion } from 'framer-motion'
import { ShieldCheck, Zap, Minimize2, Check } from 'lucide-react'
import { Badge } from '../components/ui/badge'
import { cn } from '../lib/utils'
import { useUIStore } from '../stores/ui.store'

type DnsProfileKey = 'secure' | 'balanced' | 'minimal'

interface DnsProfile {
  key: DnsProfileKey
  Icon: React.ComponentType<{ className?: string }>
  label: string
  sublabel: string
  description: string
  features: string[]
  servers: string[]
  recommended?: boolean
}

const DNS_PROFILES: DnsProfile[] = [
  {
    key: 'secure',
    Icon: ShieldCheck,
    label: 'Безопасный',
    sublabel: 'DNS-over-HTTPS + H3',
    description: 'Полная защита DNS. Fake-IP режим, DoH с HTTP/3, защита от DNS-leak. Оптимально для обхода блокировок.',
    features: ['Fake-IP', 'DoH H/3', 'DNS-leak защита', 'DNSSEC'],
    servers: ['https://dns.cloudflare.com/dns-query', 'https://dns.google/dns-query'],
    recommended: true,
  },
  {
    key: 'balanced',
    Icon: Zap,
    label: 'Сбалансированный',
    sublabel: 'DoH + UDP fallback',
    description: 'Сочетание скорости и безопасности. Fake-IP с fallback на UDP для местных доменов.',
    features: ['Fake-IP', 'DoH primary', 'UDP fallback', 'Кэширование'],
    servers: ['https://dns.cloudflare.com/dns-query', '8.8.8.8'],
  },
  {
    key: 'minimal',
    Icon: Minimize2,
    label: 'Минимальный',
    sublabel: 'UDP / системный DNS',
    description: 'Минимальная конфигурация. Redir-host режим, системные DNS-серверы. Максимальная скорость разрешения.',
    features: ['Redir-Host', 'UDP', 'Системный DNS', 'Без fake-IP'],
    servers: ['8.8.8.8', '1.1.1.1'],
  },
]

export function DnsPage() {
  const { notify } = useUIStore()
  const [selected, setSelected] = useState<DnsProfileKey>('secure')
  const [isApplying, setIsApplying] = useState(false)

  const handleSelect = async (key: DnsProfileKey) => {
    if (key === selected || isApplying) return
    setIsApplying(true)
    try {
      await new Promise(r => setTimeout(r, 300))
      setSelected(key)
      const profile = DNS_PROFILES.find(p => p.key === key)!
      notify({ type: 'success', title: 'DNS профиль изменён', message: profile.label })
    } finally {
      setIsApplying(false)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-bg-base">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border">
        <h2 className="text-[15px] font-semibold text-text-primary">DNS</h2>
        <p className="text-[12px] text-text-muted mt-0.5">Профиль разрешения имён</p>
      </div>

      <div className="flex flex-col gap-2.5 px-6 py-5">
        {/* Profile grid — 3 cards */}
        <div className="grid grid-cols-3 gap-2.5">
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
                  {/* Icon + selected */}
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

                  {/* Features */}
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

        {/* Servers + info card */}
        {DNS_PROFILES.find(p => p.key === selected) && (
          <motion.div
            key={selected}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="rounded-lg border border-border bg-bg-primary p-4"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted mb-2">
              DNS-серверы — {DNS_PROFILES.find(p => p.key === selected)!.label}
            </p>
            <div className="flex flex-col gap-1">
              {DNS_PROFILES.find(p => p.key === selected)!.servers.map(s => (
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
      </div>
    </div>
  )
}
