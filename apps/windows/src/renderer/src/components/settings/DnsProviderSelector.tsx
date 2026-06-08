import { useState } from 'react'
import { Layers, RefreshCw, Loader2, Check } from 'lucide-react'
import { cn } from '../../lib/utils'
import { IS_MOBILE } from '../../lib/platform'
import { Button } from '../ui/button'
import { useUIStore } from '../../stores/ui.store'
import { useVpnStore, selectConnectionState } from '../../stores/vpn.store'
import {
  DOH_PRESETS, getDnsProvider, setDnsProvider, type DnsProviderSetting,
} from '../../android/runtime-settings'

/**
 * DoH (DNS-over-HTTPS) provider selector for Android: pick Cloudflare / Google /
 * Quad9 / AdGuard, or a custom DoH URL. The choice drives the generated mihomo
 * DNS section (через туннель, без утечек) and applies on the next connect.
 * Android-only — desktop has the full DnsPage.
 */
export function DnsProviderSelector() {
  const { notify } = useUIStore()
  const state = useVpnStore(selectConnectionState)
  const connect = useVpnStore(s => s.connect)
  const disconnect = useVpnStore(s => s.disconnect)

  const [setting, setSetting] = useState<DnsProviderSetting>(getDnsProvider)
  const [customUrl, setCustomUrl] = useState(getDnsProvider().customUrl ?? '')
  const [dirty, setDirty] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)

  if (!IS_MOBILE) return null

  const choose = (id: string) => {
    const next: DnsProviderSetting = id === 'custom' ? { id, customUrl } : { id }
    setSetting(next); setDnsProvider(next); setDirty(true)
  }
  const saveCustom = (url: string) => {
    setCustomUrl(url)
    if (setting.id === 'custom') { const next = { id: 'custom', customUrl: url }; setSetting(next); setDnsProvider(next); setDirty(true) }
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

  const options = [...DOH_PRESETS, { id: 'custom', label: 'Свой DoH', doh: '' }]

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
