import { IpcChannel } from '../../../shared/ipc/channels'
import { EmptySchema } from '../../../shared/ipc/schemas'
import { okResult } from '../../../shared/ipc/types'
import { handleIpc, services } from '../registry'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import os from 'os'
import type { SystemInfo } from '../../../shared/ipc/types'
import type { RuntimeService } from '../../services/RuntimeService'

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
    const logPath = join(app.getPath('userData'), 'logs', 'main.log')
    const exportPath = join(app.getPath('downloads'), `slavevpn-logs-${Date.now()}.log`)

    if (existsSync(logPath)) {
      const content = readFileSync(logPath)
      writeFileSync(exportPath, content)
    } else {
      writeFileSync(exportPath, 'No log file found.')
    }

    return okResult(exportPath)
  })

  handleIpc(IpcChannel.DIAGNOSTICS_GET_LOGS, EmptySchema, async () => {
    const logPath = join(app.getPath('userData'), 'logs', 'main.log')

    if (!existsSync(logPath)) {
      return okResult([])
    }

    const raw = readFileSync(logPath, 'utf-8')
    const lines = raw
      .split('\n')
      .filter(Boolean)
      .slice(-500)
      .map((line) => {
        try {
          return JSON.parse(line) as Record<string, unknown>
        } catch {
          return { level: 'info', time: Date.now(), msg: line }
        }
      })

    return okResult(lines)
  })
}
