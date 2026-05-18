import { z } from 'zod'
import { ipcMain } from 'electron'
import { handleIpc } from '../registry'
import { IpcChannel } from '../../../shared/ipc/channels'
import { okResult, errResult } from '../../../shared/ipc/types'
import { getUpdateService } from '../../services/UpdateService'

const UpdateChannelSchema = z.object({
  channel: z.enum(['stable', 'beta']),
})

export function registerUpdateHandlers(): void {
  handleIpc(IpcChannel.UPDATE_GET_STATUS, z.undefined().or(z.null()).or(z.object({})), async () => {
    return okResult(getUpdateService().getStatus())
  })

  handleIpc(IpcChannel.UPDATE_SET_CHANNEL, UpdateChannelSchema, async ({ channel }) => {
    getUpdateService().setChannel(channel)
    return okResult(undefined as void)
  })

  handleIpc(IpcChannel.UPDATE_CHECK, z.undefined().or(z.null()).or(z.object({})), async () => {
    try {
      const result = await getUpdateService().checkForUpdates()
      return okResult(result)
    } catch (err) {
      return errResult('UPDATE_CHECK_FAILED', err instanceof Error ? err.message : String(err))
    }
  })

  handleIpc(IpcChannel.UPDATE_DOWNLOAD, z.undefined().or(z.null()).or(z.object({})), async () => {
    try {
      await getUpdateService().downloadUpdate()
      return okResult(undefined as void)
    } catch (err) {
      return errResult('UPDATE_DOWNLOAD_FAILED', err instanceof Error ? err.message : String(err))
    }
  })

  // INSTALL uses a raw ipcMain.handle because quitAndInstall is fire-and-forget
  ipcMain.handle(IpcChannel.UPDATE_INSTALL, () => {
    try {
      getUpdateService().quitAndInstall()
      return okResult(undefined as void)
    } catch (err) {
      return errResult('UPDATE_INSTALL_FAILED', err instanceof Error ? err.message : String(err))
    }
  })
}
