import { useState } from 'react'
import { motion } from 'framer-motion'
import { ShieldCheck, Zap, Minimize2, Check } from 'lucide-react'
import { Card } from '../components/ui/card'
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
      // TODO: wire to ipc.settings.set({ dnsProfile: key }) when implemented
      await new Promise(r => setTimeout(r, 300))
      setSelected(key)
      const profile = DNS_PROFILES.find(p => p.key === key)!
      notify({ type: 'success', title: 'DNS профиль изменён', message: profile.label })
    } finally {
      setIsApplying(false)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="px-6 py-5">
        <h1 className="text-sm font-semibold text-text-primary mb-1">DNS</h1>
        <p className="text-xs text-text-muted">Профиль разрешения имён</p>
      </div>

      <div className="flex flex-col gap-2.5 px-4 pb-4">
        {DNS_PROFILES.map((profile, i) => {
          const isSelected = selected === profile.key
          return (
            <motion.div
              key={profile.key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07, duration: 0.22 }}
            >
              <Card
                className={cn(
                  'cursor-pointer transition-all duration-200',
                  'hover:bg-bg-elevated active:scale-[0.99]',
                  isSelected ? 'ring-1 ring-accent/50 bg-accent/5' : 'opacity-80 hover:opacity-100',
                  isApplying && 'pointer-events-none opacity-50'
                )}
                onClick={() => void handleSelect(profile.key)}
              >
                <div className="flex items-start gap-3">
                  <div className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg mt-0.5',
                    isSelected ? 'bg-accent/20' : 'bg-bg-secondary'
                  )}>
                    <profile.Icon className={cn(
                      'h-4 w-4',
                      isSelected ? 'text-accent' : 'text-text-muted'
                    )} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={cn(
                        'text-sm font-medium',
                        isSelected ? 'text-text-primary' : 'text-text-secondary'
                      )}>
                        {profile.label}
                      </span>
                      {isSelected && <Check className="h-3.5 w-3.5 text-accent" />}
                      {profile.recommended && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-connected/15 text-connected font-medium">
                          Рекомендован
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-text-muted mb-2">{profile.sublabel}</p>
                    <p className="text-[11px] text-text-muted leading-relaxed mb-2.5">
                      {profile.description}
                    </p>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {profile.features.map(f => (
                        <span key={f} className="text-[10px] px-1.5 py-0.5 rounded-md bg-bg-secondary text-text-muted font-medium">
                          {f}
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {profile.servers.map(s => (
                        <code key={s} className="text-[10px] text-text-muted font-mono break-all">
                          {s}
                        </code>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          )
        })}
      </div>

      <div className="px-4 pb-6">
        <div className="rounded-xl border border-border/50 bg-bg-primary px-4 py-3">
          <p className="text-[11px] text-text-muted leading-relaxed">
            Изменение DNS-профиля вступает в силу при следующем подключении.
            Fake-IP режим создаёт виртуальные адреса для доменов и направляет трафик через правила маршрутизации.
          </p>
        </div>
      </div>
    </div>
  )
}
