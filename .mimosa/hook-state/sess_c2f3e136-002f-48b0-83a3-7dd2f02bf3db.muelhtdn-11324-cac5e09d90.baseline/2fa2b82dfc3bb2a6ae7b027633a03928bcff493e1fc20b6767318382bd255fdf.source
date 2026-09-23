import { IpcChannel } from '../../../shared/ipc/channels'
import { EmptySchema } from '../../../shared/ipc/schemas'
import { okResult } from '../../../shared/ipc/types'
import { handleIpc, services } from '../registry'
import type { RuntimeService } from '../../services/RuntimeService'

export function registerRuntimeHandlers(): void {
  handleIpc(IpcChannel.RUNTIME_RESTART, EmptySchema, async () => {
    if (!services.has('runtime')) return okResult(undefined)
    const runtime = services.resolve<RuntimeService>('runtime')
    const status = runtime.getStatus()
    if (
      status.state === 'connected' ||
      status.state === 'connecting' ||
      status.state === 'reconnecting'
    ) {
      await runtime.disconnect()
    }
    return okResult(undefined)
  })
}
