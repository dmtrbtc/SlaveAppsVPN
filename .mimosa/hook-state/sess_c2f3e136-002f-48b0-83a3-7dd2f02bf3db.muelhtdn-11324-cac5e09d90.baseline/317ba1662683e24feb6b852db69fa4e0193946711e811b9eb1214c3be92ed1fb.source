import { IpcChannel } from '../../../shared/ipc/channels'
import { EmptySchema } from '../../../shared/ipc/schemas'
import { okResult } from '../../../shared/ipc/types'
import { handleIpc } from '../registry'
import { consumePendingDeepLink } from '../../deeplink'

export function registerDeepLinkHandlers(): void {
  // Cold-start pull: returns a `slavevpn://import/...` URL that launched the app
  // (and clears it), or null. Warm links come via EVENT_DEEPLINK_IMPORT instead.
  handleIpc(IpcChannel.DEEPLINK_GET_PENDING, EmptySchema, async () => {
    return okResult({ url: consumePendingDeepLink() })
  })
}
