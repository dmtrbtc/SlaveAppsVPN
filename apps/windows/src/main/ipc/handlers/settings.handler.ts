import { IpcChannel } from '../../../shared/ipc/channels'
import { SettingsSetSchema, EmptySchema } from '../../../shared/ipc/schemas'
import { okResult } from '../../../shared/ipc/types'
import { handleIpc, services } from '../registry'
import { getSettingsStore } from '../../services/SettingsStore'
import type { RuntimeService } from '../../services/RuntimeService'

export function registerSettingsHandlers(): void {
  handleIpc(IpcChannel.SETTINGS_GET, EmptySchema, async () => {
    const settings = getSettingsStore().getAll()
    return okResult(settings)
  })

  handleIpc(IpcChannel.SETTINGS_SET, SettingsSetSchema, async (data) => {
    await getSettingsStore().patch(data)
    if ((data.utlsFingerprint !== undefined || data.nodeFingerprints !== undefined) && services.has('runtime')) {
      await services.resolve<RuntimeService>('runtime').notifySubscriptionsChanged('profile-apply')
    }
    return okResult(undefined)
  })
}
