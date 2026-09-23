import { useState } from 'react'
import { CapacitorHttp, Capacitor } from '@capacitor/core'
import { Wifi, Loader2, Globe2, Server, CheckCircle2, XCircle, MapPin } from 'lucide-react'
import { IS_MOBILE } from '../../lib/platform'
import { Button } from '../ui/button'
import { InfoTile } from '../ui/info-tile'

interface CheckResult {
  ok: boolean
  ip?: string
  country?: string
  colo?: string
  latencyMs?: number | null
  error?: string
  checkedAt: number
}

async function httpGet(url: string, timeoutMs = 8000): Promise<{ status: number; text: string }> {
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.get({ url, readTimeout: timeoutMs, connectTimeout: timeoutMs, responseType: 'text' } as Parameters<typeof CapacitorHttp.get>[0])
    return { status: res.status, text: typeof res.data === 'string' ? res.data : JSON.stringify(res.data) }
  }
  const res = await fetch(url)
  return { status: res.status, text: await res.text() }
}

function parseTrace(text: string): { ip?: string; country?: string; colo?: string } {
  const out: { ip?: string; country?: string; colo?: string } = {}
  for (const line of text.split('\n')) {
    const [k, v] = line.split('=')
    if (!v) continue
    if (k === 'ip') out.ip = v
    else if (k === 'loc') out.country = v
    else if (k === 'colo') out.colo = v
  }
  return out
}

/**
 * Mobile connectivity diagnostics — NON-NATIVE (CapacitorHttp), works without the
 * VPN core. Reports the current exit IP + country (via Cloudflare trace) and a
 * 204 reachability+latency probe. When connected, the request egresses through
 * the tunnel → shows the VPN exit, confirming the VPN actually works and where it
 * exits. Android-only (desktop has the full connectivity panel).
 */
export function MobileConnectivityPanel() {
  const [result, setResult] = useState<CheckResult | null>(null)
  const [running, setRunning] = useState(false)

  if (!IS_MOBILE) return null

  const run = async () => {
    if (running) return
    setRunning(true)
    try {
      // 204 reachability + latency
      let latencyMs: number | null = null
      const t0 = performance.now()
      try {
        const r = await httpGet('https://www.gstatic.com/generate_204', 8000)
        if (r.status === 204 || (r.status >= 200 && r.status < 400)) latencyMs = Math.round(performance.now() - t0)
      } catch { latencyMs = null }

      // exit IP + country (Cloudflare trace)
      let ip: string | undefined, country: string | undefined, colo: string | undefined
      try {
        const tr = await httpGet('https://1.1.1.1/cdn-cgi/trace', 8000)
        const p = parseTrace(tr.text)
        ip = p.ip; country = p.country; colo = p.colo
      } catch { /* ignore */ }

      const ok = latencyMs !== null || !!ip
      setResult({
        ok,
        ...(ip ? { ip } : {}),
        ...(country ? { country } : {}),
        ...(colo ? { colo } : {}),
        latencyMs,
        ...(ok ? {} : { error: 'Нет ответа от сети' }),
        checkedAt: Date.now(),
      })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-bg-primary p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[12px] font-semibold text-text-primary">Проверка соединения</p>
          <p className="text-[11px] text-text-muted">Текущий внешний IP, страна выхода и задержка</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void run()} disabled={running}>
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}
          {running ? 'Проверка…' : 'Проверить'}
        </Button>
      </div>

      {result && (
        <div className="flex flex-col gap-2">
          <div className={`flex items-center gap-2 rounded-md border px-3 py-2 ${result.ok ? 'border-connected/30 bg-connected/5 text-connected' : 'border-error/30 bg-error/5 text-error'}`}>
            {result.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            <span className="text-[12px] font-medium">{result.ok ? 'Сеть доступна' : (result.error ?? 'Нет соединения')}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <InfoTile icon={<Globe2 className="h-3.5 w-3.5" />} label="Внешний IP" value={result.ip ?? '—'} />
            <InfoTile icon={<MapPin className="h-3.5 w-3.5" />} label="Страна / colo" value={[result.country, result.colo].filter(Boolean).join(' / ') || '—'} />
            <InfoTile icon={<Server className="h-3.5 w-3.5" />} label="Задержка (204)" value={result.latencyMs !== null && result.latencyMs !== undefined ? `${result.latencyMs} ms` : 'timeout'} />
            <InfoTile icon={<Wifi className="h-3.5 w-3.5" />} label="Проверено" value={new Date(result.checkedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} />
          </div>
          <p className="text-[10px] text-text-muted">
            Если VPN подключён, IP и страна показывают точку выхода туннеля.
          </p>
        </div>
      )}
    </div>
  )
}
