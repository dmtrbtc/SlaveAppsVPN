import { useEffect, useState } from 'react'
import { Layers, RefreshCw, Loader2, Check } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { useUIStore } from '../../stores/ui.store'
import { useVpnStore, selectConnectionState } from '../../stores/vpn.store'
import { settingsApi, dnsApi } from '../../lib/api'
import type { DohProviderInfo, DohProviderSetting } from '@shared/ipc/types'

// Fallback default (Cloudflare) — the live catalogue comes from dnsApi.getDohProviders().
const DEFAULT_DOH_PROVIDER: DohProviderSetting = { id: 'cloudflare' }

/**
 * Cross-platform DoH (DNS-over-HTTPS) provider selector: pick Cloudflare / Google /
 * Quad9 / AdGuard, or a custom DoH URL. The choice is stored in the unified
 * AppSettings.dohProvider and overrides the DNS preset's primary endpoint on BOTH
 * platforms — Windows (engine DnsProfile) and Android (compiled mihomo config).
 * Applies on the next connect (offered inline when already connected).
 */
export function DnsProviderSelector() {
  const { notify } = useUIStore()
  const state = useVpnStore(selectConnectionState)
  const connect = useVpnStore(s => s.connect)
  const disconnect = useVpnStore(s => s.disconnect)

  const [providers, setProviders] = useState<DohProviderInfo[]>([])
  const [setting, setSetting] = useState<DohProviderSetting>(DEFAULT_DOH_PROVIDER)
  const [customUrl, setCustomUrl] = useState('')
  const [dirty, setDirty] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)

  // Load the shared DoH catalogue + the persisted provider on mount.
  useEffect(() => {
    dnsApi.getDohProviders().then(setProviders).catch(() => {})
    settingsApi.get().then(s => {
      const v = s.dohProvider ?? DEFAULT_DOH_PROVIDER
      setSetting(v)
      setCustomUrl(v.customUrl ?? '')
    }).catch(() => {})
  }, [])

  const persist = (next: DohProviderSetting) => {
    setSetting(next); setDirty(true)
    void settingsApi.set({ dohProvider: next }).catch(() => {
      notify({ type: 'error', title: 'Ошибка', message: 'Не удалось сохранить DNS-провайдер' })
    })
  }

  const choose = (id: string) => {
    persist(id === 'custom' ? { id, customUrl } : { id })
  }
  const saveCustom = (url: string) => {
    setCustomUrl(url)
    if (setting.id === 'custom') persist({ id: 'custom', customUrl: url })
  }

  const applyNow = async () => {
    if (state !== 'connected') { setDirty(false); return }
    setReconnecting(true)
    try {
      await disconnect()
      await new Promise(r => setTimeout(r, 400))
      await connect()
      setDirty(false)
      notify({ type: 'success', title: 'Применено', message: 'DNS-провайдер обновлён' })
    } catch (e) {
      notify({ type: 'error', title: 'Ошибка', message: e instanceof Error ? e.message : String(e) })
    } finally {
      setReconnecting(false)
    }
  }

  const options: DohProviderInfo[] = [...providers, { id: 'custom', label: 'Свой DoH', doh: '' }]

  return (
    <div className="rounded-lg border border-border bg-bg-primary p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-text-muted" />
        <p className="text-[13px] font-semibold text-text-primary">DNS-провайдер (DoH)</p>
      </div>
      <p className="text-[11px] text-text-muted -mt-1">
        Шифрованный DNS через туннель. Запросы не утекают провайдеру. По умолчанию — Cloudflare.
      </p>

      <div className="grid grid-cols-2 gap-2">
        {options.map(o => {
          const active = setting.id === o.id
          return (
            <button
              key={o.id}
              onClick={() => choose(o.id)}
              className={cn(
                'flex items-center justify-between gap-1 rounded-md border px-3 py-2 text-[12px] font-medium transition-all',
                active ? 'bg-accent/15 text-accent border-accent/30' : 'text-text-secondary border-border hover:bg-bg-secondary',
              )}
            >
              {o.label}
              {active && <Check className="h-3.5 w-3.5" />}
            </button>
          )
        })}
      </div>

      {setting.id === 'custom' && (
        <input
          value={customUrl}
          onChange={e => saveCustom(e.target.value)}
          placeholder="https://dns.example.com/dns-query"
          className="w-full rounded-md bg-bg-base border border-border px-2 py-1.5 text-[12px] text-text-primary placeholder:text-text-muted font-mono"
        />
      )}

      {dirty && (
        <div className="flex items-center justify-between gap-2 rounded-md bg-connecting/10 border border-connecting/30 px-3 py-2">
          <span className="text-[11px] text-connecting">
            {state === 'connected' ? 'Применится после переподключения' : 'Сохранено · применится при подключении'}
          </span>
          {state === 'connected' && (
            <Button variant="secondary" size="sm" onClick={() => void applyNow()} disabled={reconnecting}>
              {reconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Применить
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
