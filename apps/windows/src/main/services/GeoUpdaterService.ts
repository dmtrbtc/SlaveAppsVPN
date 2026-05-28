import { createHash } from 'crypto'
import { copyFileSync, existsSync, mkdirSync, statSync, unlinkSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { getLogger } from '../logger'
import { sendToRenderer } from '../window'
import { IpcChannel } from '../../shared/ipc/channels'

// Sources for auto-updateable geo databases. Each entry is fetched, validated
// (size sanity + optional SHA256), then atomically swapped into resources/rules/.
// Curated list — additions need both URLs and reasonable minimum sizes to
// reject corrupted downloads.
export interface GeoSource {
  id: string
  label: string
  url: string
  filename: string  // dest name inside rules dir
  minBytes: number  // sanity floor
  category: 'geo-db' | 'domain-list'
}

const GEO_SOURCES: readonly GeoSource[] = [
  // RuNet Freedom — primary RU-blocked geosite
  {
    id: 'runetfreedom-geosite',
    label: 'RuNet Freedom geosite-ru-only',
    url: 'https://github.com/runetfreedom/russia-blocked-geosite/releases/latest/download/geosite-ru-only.dat',
    filename: 'geosite-runetfreedom.dat',
    minBytes: 1_000_000,
    category: 'geo-db',
  },
  // RoscomVPN — curated RU/BY routing (hydraponique/roscomvpn-geosite + geoip).
  // Smaller, smarter category lists than V2Ray defaults:
  //   • category-ru with RU/BY domains minus RKN-blocked lists
  //   • dedicated "whitelist" for kazenniye RU services (VK/OK/Mail.ru/Yandex)
  //   • win-spy / twitch-ads / faceit / escapefromtarkov categories that V2Ray
  //     geosite lacks. Downloaded for the RoscomVPN Default scenario.
  {
    id: 'roscomvpn-geosite',
    label: 'RoscomVPN geosite (hydraponique)',
    url: 'https://github.com/hydraponique/roscomvpn-geosite/releases/latest/download/geosite.dat',
    filename: 'geosite-roscomvpn.dat',
    minBytes: 200_000,
    category: 'geo-db',
  },
  {
    id: 'roscomvpn-geoip',
    label: 'RoscomVPN geoip (hydraponique)',
    url: 'https://github.com/hydraponique/roscomvpn-geoip/releases/latest/download/geoip.dat',
    filename: 'geoip-roscomvpn.dat',
    minBytes: 100_000,
    category: 'geo-db',
  },
  // Mihomo geoip + geosite (the canonical ones already present at build time;
  // auto-update keeps them current between releases)
  {
    id: 'meta-rules-geoip',
    label: 'MetaCubeX geoip.dat',
    url: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.dat',
    filename: 'geoip.dat',
    minBytes: 10_000_000,
    category: 'geo-db',
  },
  {
    id: 'meta-rules-geosite',
    label: 'MetaCubeX geosite.dat',
    url: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat',
    filename: 'geosite.dat',
    minBytes: 1_000_000,
    category: 'geo-db',
  },
  // Sing-box geo databases
  {
    id: 'singbox-geoip',
    label: 'Sing-box geoip.db',
    url: 'https://github.com/SagerNet/sing-geoip/releases/latest/download/geoip.db',
    filename: 'geoip.db',
    minBytes: 1_000_000,
    category: 'geo-db',
  },
  {
    id: 'singbox-geosite',
    label: 'Sing-box geosite.db',
    url: 'https://github.com/SagerNet/sing-geosite/releases/latest/download/geosite.db',
    filename: 'geosite.db',
    minBytes: 1_000_000,
    category: 'geo-db',
  },
]

export interface GeoUpdateRecord {
  id: string
  label: string
  filename: string
  bytes: number
  sha256: string
  updatedAt: number
}

interface PersistedState {
  records: Record<string, GeoUpdateRecord>
  lastFullUpdateAt: number | null
}

const STATE_FILENAME = 'geo-state.json'
const DEFAULT_INTERVAL_HOURS = 24

function rulesPath(): string {
  return process.resourcesPath
    ? join(process.resourcesPath, 'rules')
    : join(app.getPath('userData'), 'rules')
}

function userRulesPath(): string {
  // In packaged installs, resources/ is read-only on some setups; mirror to
  // userData/rules-overlay/ which takes precedence. Read paths check overlay first.
  return join(app.getPath('userData'), 'rules-overlay')
}

function statePath(): string {
  return join(app.getPath('userData'), STATE_FILENAME)
}

function loadState(): PersistedState {
  try {
    if (!existsSync(statePath())) return { records: {}, lastFullUpdateAt: null }
    const raw = readFileSync(statePath(), 'utf-8')
    return JSON.parse(raw) as PersistedState
  } catch {
    return { records: {}, lastFullUpdateAt: null }
  }
}

function saveState(state: PersistedState): void {
  try {
    writeFileSync(statePath(), JSON.stringify(state, null, 2), 'utf-8')
  } catch (err) {
    getLogger().warn({ err }, 'Failed to persist geo state')
  }
}

async function downloadToTemp(url: string, timeoutMs: number): Promise<{ tmpPath: string; bytes: number; sha256: string }> {
  const log = getLogger()
  const tmpPath = join(app.getPath('temp'), `slave-geo-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`)

  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(tmpPath, buf)
  const sha256 = createHash('sha256').update(buf).digest('hex')
  log.debug({ url, bytes: buf.length }, 'Geo source downloaded')
  return { tmpPath, bytes: buf.length, sha256 }
}

export interface UpdateOutcome {
  id: string
  status: 'ok' | 'skipped' | 'error'
  bytes?: number
  sha256?: string
  error?: string
}

export interface GeoUpdaterState {
  records: GeoUpdateRecord[]
  lastFullUpdateAt: number | null
  inProgress: boolean
  intervalHours: number
}

const FETCH_TIMEOUT_MS = 60_000

export class GeoUpdaterService {
  private state: PersistedState = loadState()
  private inProgress = false
  private timer: ReturnType<typeof setInterval> | null = null
  private intervalHours = DEFAULT_INTERVAL_HOURS

  init(intervalHours: number = DEFAULT_INTERVAL_HOURS): void {
    this.intervalHours = intervalHours
    mkdirSync(userRulesPath(), { recursive: true })
    this.startSchedule()
  }

  startSchedule(): void {
    this.stopSchedule()
    if (this.intervalHours <= 0) return
    const ms = this.intervalHours * 3600 * 1000
    this.timer = setInterval(() => {
      void this.updateAll().catch((err: unknown) =>
        getLogger().warn({ err }, 'Scheduled geo update failed'))
    }, ms)
    if (this.timer.unref) this.timer.unref()
  }

  stopSchedule(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  getState(): GeoUpdaterState {
    return {
      records: Object.values(this.state.records).sort((a, b) => b.updatedAt - a.updatedAt),
      lastFullUpdateAt: this.state.lastFullUpdateAt,
      inProgress: this.inProgress,
      intervalHours: this.intervalHours,
    }
  }

  listSources(): readonly GeoSource[] {
    return GEO_SOURCES
  }

  // Resolve the effective path of a geo file: prefer the overlay (auto-updated)
  // over the bundled resources copy. Engine compilers should use this.
  resolveFilePath(filename: string): string {
    const overlay = join(userRulesPath(), filename)
    if (existsSync(overlay)) return overlay
    return join(rulesPath(), filename)
  }

  // Where geo configs should reference — the overlay directory.
  // Returns null if no overlay files exist yet (engine then uses bundled).
  effectiveRulesDir(): string | null {
    const overlayDir = userRulesPath()
    if (!existsSync(overlayDir)) return null
    // If overlay is empty, return bundled rules dir
    const bundled = rulesPath()
    const overlayFiles = Object.values(this.state.records)
    return overlayFiles.length > 0 ? overlayDir : bundled
  }

  async updateOne(id: string): Promise<UpdateOutcome> {
    const source = GEO_SOURCES.find(s => s.id === id)
    if (!source) return { id, status: 'error', error: `Unknown source: ${id}` }
    return this.runUpdate(source)
  }

  async updateAll(): Promise<UpdateOutcome[]> {
    if (this.inProgress) {
      return GEO_SOURCES.map(s => ({ id: s.id, status: 'skipped' as const, error: 'Already in progress' }))
    }
    this.inProgress = true
    this.emitState()
    const log = getLogger()
    log.info({ sources: GEO_SOURCES.length }, 'Geo full update starting')

    const results: UpdateOutcome[] = []
    try {
      for (const source of GEO_SOURCES) {
        // Sequential to avoid hammering — most lists are tiny
        // eslint-disable-next-line no-await-in-loop
        const outcome = await this.runUpdate(source)
        results.push(outcome)
      }
      this.state.lastFullUpdateAt = Date.now()
      saveState(this.state)
    } finally {
      this.inProgress = false
      this.emitState()
    }
    log.info({
      ok: results.filter(r => r.status === 'ok').length,
      errors: results.filter(r => r.status === 'error').length,
    }, 'Geo full update complete')
    return results
  }

  private async runUpdate(source: GeoSource): Promise<UpdateOutcome> {
    const log = getLogger()
    try {
      const { tmpPath, bytes, sha256 } = await downloadToTemp(source.url, FETCH_TIMEOUT_MS)

      if (bytes < source.minBytes) {
        unlinkSync(tmpPath)
        throw new Error(`Downloaded file too small (${bytes} < ${source.minBytes}) — likely corrupted`)
      }

      // Atomic swap
      const finalPath = join(userRulesPath(), source.filename)
      mkdirSync(userRulesPath(), { recursive: true })
      copyFileSync(tmpPath, finalPath)
      unlinkSync(tmpPath)

      const record: GeoUpdateRecord = {
        id: source.id,
        label: source.label,
        filename: source.filename,
        bytes,
        sha256,
        updatedAt: Date.now(),
      }
      this.state.records[source.id] = record
      saveState(this.state)
      this.emitState()
      log.info({ id: source.id, bytes, sha256: sha256.slice(0, 12) }, 'Geo source updated')
      return { id: source.id, status: 'ok', bytes, sha256 }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.warn({ id: source.id, err: message }, 'Geo source update failed')
      return { id: source.id, status: 'error', error: message }
    }
  }

  private emitState(): void {
    sendToRenderer(IpcChannel.EVENT_GEO_UPDATER_STATE, this.getState())
  }

  // Check whether bundled files exist; otherwise we depend on first auto-update.
  hasAnyData(): boolean {
    return existsSync(join(rulesPath(), 'geosite.dat')) ||
           existsSync(join(rulesPath(), 'geosite.db')) ||
           Object.keys(this.state.records).length > 0
  }

  // File size + timestamp helper for diagnostics
  fileInfo(filename: string): { exists: boolean; path: string; bytes: number; mtime: number } {
    const path = this.resolveFilePath(filename)
    if (!existsSync(path)) {
      return { exists: false, path, bytes: 0, mtime: 0 }
    }
    const stat = statSync(path)
    return { exists: true, path, bytes: stat.size, mtime: stat.mtimeMs }
  }
}

let _instance: GeoUpdaterService | null = null
export function getGeoUpdaterService(): GeoUpdaterService {
  if (!_instance) _instance = new GeoUpdaterService()
  return _instance
}
