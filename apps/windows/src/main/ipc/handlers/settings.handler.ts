import { IpcChannel } from '../../../shared/ipc/channels'
import { SettingsSetSchema, EmptySchema } from '../../../shared/ipc/schemas'
import { okResult } from '../../../shared/ipc/types'
import { handleIpc } from '../registry'
import { getSettingsStore } from '../../services/SettingsStore'

export function registerSettingsHandlers(): void {
  handleIpc(IpcChannel.SETTINGS_GET, EmptySchema, async () => {
    const settings = getSettingsStore().getAll()
    return okResult(settings)
  })

  handleIpc(IpcChannel.SETTINGS_SET, SettingsSetSchema, async (data) => {
    getSettingsStore().patch(data)
    return okResult(undefined)
  })
}
