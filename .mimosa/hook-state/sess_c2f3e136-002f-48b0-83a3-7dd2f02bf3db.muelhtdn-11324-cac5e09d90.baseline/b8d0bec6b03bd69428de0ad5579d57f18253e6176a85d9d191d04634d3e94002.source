import { existsSync, statSync } from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { getLogger } from '../logger'
import { getSettingsStore } from './SettingsStore'
import { getSubscriptionStore } from './SubscriptionStore'
import { getSubscriptionAggregator } from './SubscriptionAggregatorService'
import { normalizeSubscriptionContent } from '@slave-vpn/config'

const execFileAsync = promisify(execFile)

export type SelfTestStatus = 'ok' | 'warning' | 'error' | 'skipped'

export interface SelfTestCheck {
  id: string
  label: string
  status: SelfTestStatus
  detail: string
  durationMs: number
}

export interface SelfTestReport {
  checks: SelfTestCheck[]
  overall: SelfTestStatus
  ranAt: number
  totalMs: number
}

interface CheckSpec {
  id: string
  label: string
  run: () => Promise<{ status: SelfTestStatus; detail: string }>
}

function resourcesPath(): string {
  return process.resourcesPath ?? join(process.cwd(), 'resources')
}

function binPath(name: string): string {
  return join(resourcesPath(), 'bin', name)
}

function rulesPath(name: string): string {
  return join(resourcesPath(), 'rules', name)
}

// ─── Individual checks ────────────────────────────────────────────────────────

async function checkBinaryRuns(name: string, displayName: string, arg = '-v'): Promise<{ status: SelfTestStatus; detail: string }> {
  const p = binPath(name)
  if (!existsSync(p)) {
    return { status: 'error', detail: `${displayName} binary отсутствует` }
  }
  try {
    const { stdout, stderr } = await execFileAsync(p, [arg], { timeout: 5_000 })
    const out = (stdout + stderr).trim().split('\n')[0] ?? '(no output)'
    return { status: 'ok', detail: out }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { status: 'error', detail: `Запуск ${displayName} провалился: ${message}` }
  }
}

async function checkGeoDb(filename: string, label: string): Promise<{ status: SelfTestStatus; detail: string }> {
  const p = rulesPath(filename)
  if (!existsSync(p)) {
    return { status: 'warning', detail: `${label} отсутствует — geosite/geoip правила не сработают` }
  }
  const size = statSync(p).size
  if (size < 100_000) {
    return { status: 'warning', detail: `${label} слишком маленький (${size} bytes) — повреждён?` }
  }
  return { status: 'ok', detail: `${label} — ${(size / 1024 / 1024).toFixed(1)} MB` }
}

async function checkApiPortFree(port: number): Promise<{ status: SelfTestStatus; detail: string }> {
  try {
    // If anything answers, the port is occupied (potentially good — VPN running).
    // If connection refused → free.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1500)
    try {
      const res = await fetch(`http://127.0.0.1:${port}/version`, { signal: controller.signal })
      if (res.status > 0) {
        return { status: 'warning', detail: `Port ${port} занят — возможно VPN уже работает` }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/aborted|refused|ECONNREFUSED|fetch failed/i.test(msg)) {
        return { status: 'ok', detail: `Port ${port} свободен` }
      }
      return { status: 'warning', detail: `Port ${port}: ${msg}` }
    } finally {
      clearTimeout(timer)
    }
    return { status: 'ok', detail: `Port ${port} проверен` }
  } catch (err) {
    return { status: 'warning', detail: err instanceof Error ? err.message : String(err) }
  }
}

async function checkInternet(): Promise<{ status: SelfTestStatus; detail: string }> {
  try {
    const res = await fetch('http://connectivitycheck.gstatic.com/generate_204', {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
      redirect: 'manual',
    })
    if (res.status === 204) return { status: 'ok', detail: 'Прямой доступ в интернет работает' }
    return { status: 'warning', detail: `Captive portal или прокси? HTTP ${res.status}` }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { status: 'error', detail: `Нет связи: ${msg}` }
  }
}

async function checkSubscriptionParse(): Promise<{ status: SelfTestStatus; detail: string }> {
  const enabled = getSubscriptionStore().list().filter(e => e.enabled)
  if (enabled.length === 0) {
    return { status: 'skipped', detail: 'Нет подписок для проверки' }
  }

  try {
    const snapshot = await getSubscriptionAggregator().fetchAggregatedYaml()
    if (snapshot.totalProxies === 0) {
      return { status: 'error', detail: 'Aggregator вернул 0 нод' }
    }
    // Re-normalize just to confirm parser accepts what we built
    const re = normalizeSubscriptionContent(snapshot.yaml)
    if (re.proxyCount !== snapshot.totalProxies) {
      return { status: 'warning', detail: `Парсер видит ${re.proxyCount} нод, агрегатор ${snapshot.totalProxies}` }
    }
    return { status: 'ok', detail: `${snapshot.totalProxies} нод собрано из ${enabled.length} подписок` }
  } catch (err) {
    return { status: 'error', detail: err instanceof Error ? err.message : String(err) }
  }
}

async function checkWintun(): Promise<{ status: SelfTestStatus; detail: string }> {
  const p = binPath('wintun.dll')
  if (!existsSync(p)) {
    return { status: 'error', detail: 'wintun.dll не найден — TUN не заработает' }
  }
  const size = statSync(p).size
  if (size < 100_000) {
    return { status: 'warning', detail: `wintun.dll маленький (${size}) — повреждён?` }
  }
  return { status: 'ok', detail: `wintun.dll — ${(size / 1024).toFixed(0)} KB` }
}

async function checkAdminElevation(): Promise<{ status: SelfTestStatus; detail: string }> {
  try {
    // PowerShell: ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(...)
    const { stdout } = await execFileAsync('powershell', [
      '-NoProfile',
      '-Command',
      '([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")',
    ], { timeout: 3_000 })
    const isAdmin = /True/i.test(stdout)
    return isAdmin
      ? { status: 'ok', detail: 'Запущено от имени администратора (TUN работает)' }
      : { status: 'warning', detail: 'НЕ от администратора — TUN адаптер недоступен; запустите как admin' }
  } catch (err) {
    return { status: 'warning', detail: `Не удалось проверить: ${err instanceof Error ? err.message : String(err)}` }
  }
}

// ─── Main runner ──────────────────────────────────────────────────────────────

async function runCheck(spec: CheckSpec): Promise<SelfTestCheck> {
  const start = Date.now()
  try {
    const { status, detail } = await spec.run()
    return { id: spec.id, label: spec.label, status, detail, durationMs: Date.now() - start }
  } catch (err) {
    return {
      id: spec.id,
      label: spec.label,
      status: 'error',
      detail: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    }
  }
}

function deriveOverall(checks: SelfTestCheck[]): SelfTestStatus {
  if (checks.some(c => c.status === 'error')) return 'error'
  if (checks.some(c => c.status === 'warning')) return 'warning'
  return 'ok'
}

export async function runSelfTest(): Promise<SelfTestReport> {
  const log = getLogger()
  const settings = getSettingsStore()
  const apiPort = 9090  // VPN.MIHOMO_API_PORT — hardcoded to avoid circular import
  const selectedEngine = settings.get('selectedEngine') ?? 'mihomo'

  log.info('Self-test starting')
  const start = Date.now()

  const specs: CheckSpec[] = [
    { id: 'admin',     label: 'Права администратора',  run: checkAdminElevation },
    { id: 'wintun',    label: 'WinTUN driver',          run: checkWintun },
    { id: 'mihomo',    label: 'Mihomo binary',          run: () => checkBinaryRuns('mihomo.exe', 'Mihomo', '-v') },
    { id: 'singbox',   label: 'Sing-box binary',
      run: async () => {
        // Only fail hard if user selected sing-box and it's missing
        const r = await checkBinaryRuns('sing-box.exe', 'Sing-box', 'version')
        if (r.status === 'error' && selectedEngine !== 'singbox') {
          return { status: 'skipped', detail: 'Sing-box не выбран — пропущено' }
        }
        return r
      },
    },
    { id: 'geoip-mihomo',   label: 'geoip.dat (mihomo)',  run: () => checkGeoDb('geoip.dat',   'geoip.dat') },
    { id: 'geosite-mihomo', label: 'geosite.dat (mihomo)', run: () => checkGeoDb('geosite.dat', 'geosite.dat') },
    { id: 'geoip-singbox',  label: 'geoip.db (sing-box)',  run: () => checkGeoDb('geoip.db',   'geoip.db') },
    { id: 'geosite-singbox', label: 'geosite.db (sing-box)', run: () => checkGeoDb('geosite.db', 'geosite.db') },
    { id: 'api-port',    label: `API port ${apiPort}`,     run: () => checkApiPortFree(apiPort) },
    { id: 'internet',    label: 'Доступ в интернет',       run: checkInternet },
    { id: 'subscription', label: 'Парсинг подписок',        run: checkSubscriptionParse },
  ]

  const results: SelfTestCheck[] = []
  for (const spec of specs) {
    // eslint-disable-next-line no-await-in-loop
    const r = await runCheck(spec)
    results.push(r)
  }

  const report: SelfTestReport = {
    checks: results,
    overall: deriveOverall(results),
    ranAt: Date.now(),
    totalMs: Date.now() - start,
  }
  log.info({ overall: report.overall, totalMs: report.totalMs }, 'Self-test complete')
  return report
}
