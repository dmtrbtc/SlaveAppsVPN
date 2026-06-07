import { useState } from 'react'
import { Globe, Zap, Bug } from 'lucide-react'
import { cn } from '../../lib/utils'
import { IS_MOBILE } from '../../lib/platform'
import { useVpnStore, selectConnectionState } from '../../stores/vpn.store'
import { useUIStore } from '../../stores/ui.store'

// Must match ROUTING_MODE_LS_KEY in android/bridge.ts (the bridge reads it on
// connect; we write it here). The mode shapes the generated mihomo rule list.
const ROUTING_MODE_LS_KEY = 'slave.settings.routingMode.v1'

type Mode = 'smart' | 'global' | 'direct'

const MODES: { id: Mode; label: string; hint: string; icon: typeof Globe }[] = [
  { id: 'smart',  label: 'Умный',     hint: 'РФ — напрямую, заблокированное — через VPN', icon: Zap },
  { id: 'global', label: 'Глобальный', hint: 'Весь трафик через VPN',                      icon: Globe },
  { id: 'direct', label: 'Отладка',   hint: 'Весь трафик напрямую (диагностика)',          icon: Bug },
]

function readMode(): Mode {
  try {
    const m = window.localStorage.getItem(ROUTING_MODE_LS_KEY)
    if (m === 'smart' || m === 'global' || m === 'direct') return m
  } catch { /* ignore */ }
  return 'smart'
}

/**
 * Android routing-mode switch (Smart RU-split / Global / Direct). Writes the
 * persisted key the bridge reads on connect, and reconnects to apply when
 * already connected. Android-only (the mode shapes the mihomo config there).
 */
export function RoutingModeSwitch() {
  const [mode, setMode] = useState<Mode>(readMode)
  const state = useVpnStore(selectConnectionState)
  const connect = useVpnStore(s => s.connect)
  const disconnect = useVpnStore(s => s.disconnect)
  const { notify } = useUIStore()

  if (!IS_MOBILE) return null

  const apply = async (m: Mode) => {
    if (m === mode) return
    setMode(m)
    try { window.localStorage.setItem(ROUTING_MODE_LS_KEY, m) } catch { /* ignore */ }
    if (state === 'connected') {
      // Reconnect so the new rule set takes effect.
      try {
        await disconnect()
        await new Promise(r => setTimeout(r, 400))
        await connect()
        notify({ type: 'success', title: 'Режим', message: MODES.find(x => x.id === m)?.label ?? m })
      } catch (e) {
        notify({ type: 'error', title: 'Ошибка', message: e instanceof Error ? e.message : String(e) })
      }
    }
  }

  const active = MODES.find(m => m.id === mode)

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">Маршрутизация</span>
      <div className="flex gap-1 rounded-lg bg-bg-secondary p-0.5">
        {MODES.map(m => {
          const Icon = m.icon
          const on = m.id === mode
          return (
            <button
              key={m.id}
              onClick={() => void apply(m.id)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all',
                on ? 'bg-accent/15 text-accent border border-accent/25' : 'text-text-muted hover:text-text-secondary border border-transparent',
              )}
            >
              <Icon className="h-3 w-3" /> {m.label}
            </button>
          )
        })}
      </div>
      {active && <span className="text-[10px] text-text-muted">{active.hint}</span>}
    </div>
  )
}
