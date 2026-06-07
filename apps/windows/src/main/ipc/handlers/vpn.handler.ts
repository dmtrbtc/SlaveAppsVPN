import { IpcChannel } from '../../../shared/ipc/channels'
import { VpnSetModeSchema, EmptySchema } from '../../../shared/ipc/schemas'
import { errResult, okResult } from '../../../shared/ipc/types'
import { handleIpc, services } from '../registry'
import type { RuntimeService } from '../../services/RuntimeService'
import { INITIAL_VPN_STATUS } from '@slave-vpn/shared'
import { z } from 'zod'

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
      return okResult(INITIAL_VPN_STATUS)
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

  handleIpc(IpcChannel.VPN_GET_CONNECTIVITY, EmptySchema, async () => {
    if (!services.has('runtime')) {
      return okResult(null)
    }
    const runtime = services.resolve<RuntimeService>('runtime')
    const info = await runtime.getConnectivity()
    return okResult(info)
  })

  handleIpc(IpcChannel.VPN_SET_PROXY, z.object({ proxyName: z.string() }), async (payload) => {
    try {
      const runtime = services.resolve<RuntimeService>('runtime')
      await runtime.setSelectedProxy(payload.proxyName)
      return okResult(undefined)
    } catch (err) {
      return errResult('SET_PROXY_ERROR', err instanceof Error ? err.message : String(err))
    }
  })

  handleIpc(IpcChannel.VPN_GET_PROXY_LIST, EmptySchema, async () => {
    try {
      const runtime = services.resolve<RuntimeService>('runtime')
      const list = await runtime.getProxyList()
      return okResult(list)
    } catch {
      return okResult([])
    }
  })

  handleIpc(IpcChannel.VPN_GET_CONNECTIONS, EmptySchema, async () => {
    if (!services.has('runtime')) return okResult(null)
    try {
      const runtime = services.resolve<RuntimeService>('runtime')
      const snapshot = await runtime.getConnections()
      return okResult(snapshot)
    } catch (err) {
      return errResult('CONNECTIONS_ERROR', err instanceof Error ? err.message : String(err))
    }
  })

  handleIpc(IpcChannel.VPN_CLOSE_CONNECTION, z.object({ id: z.string().min(1) }), async ({ id }) => {
    try {
      const runtime = services.resolve<RuntimeService>('runtime')
      await runtime.closeConnection(id)
      return okResult(undefined)
    } catch (err) {
      return errResult('CONNECTIONS_ERROR', err instanceof Error ? err.message : String(err))
    }
  })
}
