import { IpcChannel } from '../../../shared/ipc/channels'
import { VpnSetModeSchema, EmptySchema } from '../../../shared/ipc/schemas'
import { errResult, okResult } from '../../../shared/ipc/types'
import { handleIpc, services } from '../registry'
import type { RuntimeService } from '../../services/RuntimeService'

export function registerVpnHandlers(): void {
  handleIpc(IpcChannel.VPN_CONNECT, EmptySchema, async () => {
    if (!services.has('runtime')) {
      return errResult('NOT_INITIALIZED', 'VPN runtime not yet initialized')
    }
    const runtime = services.resolve<RuntimeService>('runtime')
    await runtime.connect()
    return okResult(undefined)
  })

  handleIpc(IpcChannel.VPN_DISCONNECT, EmptySchema, async () => {
    if (!services.has('runtime')) {
      return errResult('NOT_INITIALIZED', 'VPN runtime not yet initialized')
    }
    const runtime = services.resolve<RuntimeService>('runtime')
    await runtime.disconnect()
    return okResult(undefined)
  })

  handleIpc(IpcChannel.VPN_GET_STATUS, EmptySchema, async () => {
    if (!services.has('runtime')) {
      return okResult({
        state: 'disconnected' as const,
        mode: 'bypass' as const,
        protocol: null,
        serverName: null,
        countryCode: null,
        connectedAt: null,
        lastError: null,
      })
    }
    const runtime = services.resolve<RuntimeService>('runtime')
    const status = runtime.getStatus()
    return okResult(status)
  })

  handleIpc(IpcChannel.VPN_SET_MODE, VpnSetModeSchema, async (data) => {
    if (!services.has('runtime')) {
      return errResult('NOT_INITIALIZED', 'VPN runtime not yet initialized')
    }
    const runtime = services.resolve<RuntimeService>('runtime')
    await runtime.setMode(data.mode)
    return okResult(undefined)
  })
}
