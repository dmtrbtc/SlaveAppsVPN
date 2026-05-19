import { execSync } from 'child_process'
import { createHash, randomUUID } from 'crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

const DEVICE_ID_FILE = 'device-id.json'

interface DeviceIdRecord {
  hwid: string
  source: 'registry' | 'uuid'
  createdAt: number
}

function readWindowsMachineGuid(): string | null {
  try {
    const out = execSync(
      'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
      { encoding: 'utf-8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] },
    )
    const m = out.match(/MachineGuid\s+REG_SZ\s+([a-fA-F0-9-]+)/)
    return m?.[1]?.trim() ?? null
  } catch {
    return null
  }
}

function deriveHwid(raw: string): string {
  return createHash('sha256').update(`slavevpn-hwid-v1:${raw}`).digest('hex')
}

class WindowsDeviceIdentity {
  private _hwid: string | null = null
  private readonly filePath: string

  constructor() {
    this.filePath = join(app.getPath('userData'), DEVICE_ID_FILE)
  }

  getHwid(): string {
    if (!this._hwid) this._hwid = this.resolveHwid()
    return this._hwid
  }

  private resolveHwid(): string {
    const persisted = this.loadPersisted()
    if (persisted) return persisted

    const machineGuid = readWindowsMachineGuid()
    const source: DeviceIdRecord['source'] = machineGuid ? 'registry' : 'uuid'
    const raw = machineGuid ?? randomUUID()
    const hwid = deriveHwid(raw)

    this.persist({ hwid, source, createdAt: Date.now() })
    return hwid
  }

  private loadPersisted(): string | null {
    if (!existsSync(this.filePath)) return null
    try {
      const rec = JSON.parse(readFileSync(this.filePath, 'utf-8')) as DeviceIdRecord
      if (typeof rec.hwid === 'string' && rec.hwid.length === 64) return rec.hwid
    } catch { /* fall through */ }
    return null
  }

  private persist(rec: DeviceIdRecord): void {
    try {
      writeFileSync(this.filePath, JSON.stringify(rec, null, 2), 'utf-8')
    } catch { /* best-effort */ }
  }
}

let _instance: WindowsDeviceIdentity | null = null

export function getDeviceIdentity(): WindowsDeviceIdentity {
  if (!_instance) _instance = new WindowsDeviceIdentity()
  return _instance
}
