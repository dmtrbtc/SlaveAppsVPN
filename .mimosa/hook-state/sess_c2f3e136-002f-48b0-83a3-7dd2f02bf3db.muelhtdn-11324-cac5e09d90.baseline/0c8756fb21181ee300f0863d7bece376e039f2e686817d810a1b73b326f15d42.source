import { IpcChannel } from '../../../shared/ipc/channels'
import { EmptySchema } from '../../../shared/ipc/schemas'
import { okResult } from '../../../shared/ipc/types'
import { handleIpc } from '../registry'
import { clearSubscriptionCache } from '../../bootstrap'

export function registerCacheHandlers(): void {
  handleIpc(IpcChannel.CACHE_CLEAR, EmptySchema, async () => {
    await clearSubscriptionCache()
    return okResult(undefined)
  })
}
