import { IpcChannel } from '../../../shared/ipc/channels'
import { z } from 'zod'
import { okResult, errResult } from '../../../shared/ipc/types'
import { handleIpc } from '../registry'
import { getNodeBalancerService } from '../../services/NodeBalancerService'
import { getSettingsStore } from '../../services/SettingsStore'
import { EmptySchema } from '../../../shared/ipc/schemas'
import { VPN } from '@slave-vpn/shared'

// Inline schemas
const BalancerSetEnabledSchema = z.object({ enabled: z.boolean() })
const BalancerSetModeSchema = z.object({ mode: z.enum(['latency', 'stability', 'balanced', 'manual']) })

export function registerBalancerHandlers(): void {
  const settings = getSettingsStore()
  const apiPort = VPN.MIHOMO_API_PORT
  const apiSecret = ''  // fetched from settings or generated at runtime

  handleIpc(IpcChannel.VPN_GET_BALANCER_STATE, EmptySchema, async () => {
    const svc = getNodeBalancerService(apiPort, apiSecret)
    return okResult(svc.getState())
  })

  handleIpc(IpcChannel.VPN_SET_BALANCER_ENABLED, BalancerSetEnabledSchema, async (payload) => {
    try {
      const svc = getNodeBalancerService(apiPort, apiSecret)
      await svc.setEnabled(payload.enabled)
      settings.patch({ balancerEnabled: payload.enabled })
      return okResult(undefined)
    } catch (err) {
      return errResult('BALANCER_ERROR', err instanceof Error ? err.message : String(err))
    }
  })

  handleIpc(IpcChannel.VPN_SET_BALANCER_MODE, BalancerSetModeSchema, async (payload) => {
    try {
      const svc = getNodeBalancerService(apiPort, apiSecret)
      await svc.setMode(payload.mode as any)
      settings.patch({ balancerMode: payload.mode as any })
      return okResult(undefined)
    } catch (err) {
      return errResult('BALANCER_ERROR', err instanceof Error ? err.message : String(err))
    }
  })

  handleIpc(IpcChannel.VPN_PROBE_ALL, EmptySchema, async () => {
    try {
      const svc = getNodeBalancerService(apiPort, apiSecret)
      await svc.probeAll()
      return okResult(undefined)
    } catch (err) {
      return errResult('PROBE_ERROR', err instanceof Error ? err.message : String(err))
    }
  })
}
