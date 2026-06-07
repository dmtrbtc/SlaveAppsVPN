import { IpcChannel } from '../../../shared/ipc/channels'
import { EmptySchema } from '../../../shared/ipc/schemas'
import { okResult, errResult } from '../../../shared/ipc/types'
import { handleIpc, services } from '../registry'
import { runSelfTest } from '../../services/SelfTestService'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'
import os from 'os'
import type { SystemInfo } from '../../../shared/ipc/types'
import type { RuntimeService } from '../../services/RuntimeService'
import { getSessionId } from '../../logger'
import { startupTracker } from '../../startup-tracker'

const execFileAsync = promisify(execFile)

async function buildZipBundle(logDir: string, destPath: string): Promise<void> {
  const candidates = [
    join(logDir, 'main.log'),
    join(logDir, 'main.log.1'),
    join(logDir, 'main.log.2'),
    join(logDir, 'crash.log'),
  ].filter(existsSync)

  if (candidates.length === 0) return

  // Use Windows PowerShell Compress-Archive (available on Win8+)
  const paths = candidates.map(p => `"${p}"`).join(',')
  const script = `Compress-Archive -Path @(${paths}) -DestinationPath "${destPath}" -Force`

  await execFileAsync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command', script,
  ], { timeout: 30_000 })
}

export function registerDiagnosticsHandlers(): void {
  handleIpc(IpcChannel.DIAGNOSTICS_COLLECT, EmptySchema, async () => {
    const mihomoVersion = services.has('runtime')
      ? services.resolve<RuntimeService>('runtime').getEngineVersion()
      : null

    const info: SystemInfo = {
      platform: process.platform,
      arch: process.arch,
      osVersion: os.release(),
      appVersion: app.getVersion(),
      mihomoVersion,
      totalMemoryMb: Math.round(os.totalmem() / 1024 / 1024),
      freeMemoryMb: Math.round(os.freemem() / 1024 / 1024),
      uptime: Math.round(process.uptime()),
    }
    return okResult(info)
  })

  handleIpc(IpcChannel.DIAGNOSTICS_EXPORT_LOGS, EmptySchema, async () => {
    const logDir = join(app.getPath('userData'), 'logs')
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const zipPath = join(app.getPath('downloads'), `slavevpn-logs-${timestamp}.zip`)

    try {
      await buildZipBundle(logDir, zipPath)
      if (existsSync(zipPath)) {
        return okResult(zipPath)
      }
    } catch { /* fall through to text export */ }

    // Fallback: export main.log as plain text
    const logPath = join(logDir, 'main.log')
    const fallbackPath = join(app.getPath('downloads'), `slavevpn-logs-${timestamp}.log`)
    const content = existsSync(logPath) ? readFileSync(logPath) : Buffer.from('No logs found.')
    const { writeFileSync } = await import('fs')
    writeFileSync(fallbackPath, content)
    return okResult(fallbackPath)
  })

  handleIpc(IpcChannel.DIAGNOSTICS_GET_STARTUP, EmptySchema, async () => {
    return okResult(startupTracker.getReport())
  })

  handleIpc(IpcChannel.DIAGNOSTICS_GET_LOGS, EmptySchema, async () => {
    const logPath = join(app.getPath('userData'), 'logs', 'main.log')

    if (!existsSync(logPath)) {
      return okResult([])
    }

    const session = getSessionId()
    const raw = readFileSync(logPath, 'utf-8')
    const lines = raw
      .split('\n')
      .filter(Boolean)
      .slice(-500)
      .map((line) => {
        try {
          return JSON.parse(line) as Record<string, unknown>
        } catch {
          return { level: 'info', time: Date.now(), msg: line, session }
        }
      })

    return okResult(lines)
  })

  handleIpc(IpcChannel.DIAGNOSTICS_SELF_TEST, EmptySchema, async () => {
    try {
      const report = await runSelfTest()
      return okResult(report)
    } catch (err) {
      return errResult('SELF_TEST_ERROR', err instanceof Error ? err.message : String(err))
    }
  })
}

