import { IpcChannel } from '../../../shared/ipc/channels'
import { z } from 'zod'
import { okResult } from '../../../shared/ipc/types'
import { handleIpc } from '../registry'
import { getSettingsStore } from '../../services/SettingsStore'
import { EmptySchema } from '../../../shared/ipc/schemas'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const SetProcessListSchema = z.object({ processList: z.array(z.string()) })

export function registerSplitHandlers(): void {
  handleIpc(IpcChannel.SPLIT_GET_PROCESSES, EmptySchema, async () => {
    try {
      // Use tasklist to enumerate running processes on Windows
      const { stdout } = await execFileAsync('tasklist', ['/FO', 'CSV', '/NH'], { timeout: 5000 })
      const processes = stdout
        .split('\n')
        .filter(Boolean)
        .map(line => {
          const parts = line.split('","')
          if (parts.length < 2 || parts[0] === undefined || parts[1] === undefined) return null
          const name = parts[0].replace(/^"/, '')
          const pid = parseInt(parts[1], 10)
          return { name, path: name, pid, description: name.replace('.exe', '') }
        })
        .filter((p): p is NonNullable<typeof p> => p !== null && !isNaN(p.pid))
      // Deduplicate by name
      const seen = new Set<string>()
      const unique = processes.filter(p => {
        if (seen.has(p.name)) return false
        seen.add(p.name)
        return true
      })
      return okResult(unique)
    } catch {
      return okResult([])
    }
  })

  handleIpc(IpcChannel.SPLIT_GET_PROCESS_LIST, EmptySchema, async () => {
    const settings = getSettingsStore()
    return okResult(settings.get('splitProcessList') ?? [])
  })

  handleIpc(IpcChannel.SPLIT_SET_PROCESS_LIST, SetProcessListSchema, async ({ processList }) => {
    const settings = getSettingsStore()
    settings.patch({ splitProcessList: processList })
    return okResult(undefined)
  })
}
