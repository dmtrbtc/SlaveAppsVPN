import { IpcChannel } from '../../../shared/ipc/channels'
import { RemoveDeviceSchema, EmptySchema } from '../../../shared/ipc/schemas'
import { errResult, okResult } from '../../../shared/ipc/types'
import { handleIpc, services } from '../registry'
import type { SubscriptionService } from '../../services/SubscriptionService'

export function registerSubscriptionHandlers(): void {
  handleIpc(IpcChannel.SUBSCRIPTION_GET, EmptySchema, async () => {
    if (!services.has('subscription')) {
      return errResult('NOT_INITIALIZED', 'Subscription service not yet initialized')
    }
    const sub = services.resolve<SubscriptionService>('subscription')
    const subscription = await sub.get()
    return okResult(subscription)
  })

  handleIpc(IpcChannel.SUBSCRIPTION_REFRESH, EmptySchema, async () => {
    if (!services.has('subscription')) {
      return errResult('NOT_INITIALIZED', 'Subscription service not yet initialized')
    }
    const sub = services.resolve<SubscriptionService>('subscription')
    const subscription = await sub.refresh()
    return okResult(subscription)
  })

  handleIpc(IpcChannel.SUBSCRIPTION_GET_DEVICES, EmptySchema, async () => {
    if (!services.has('subscription')) {
      return errResult('NOT_INITIALIZED', 'Subscription service not yet initialized')
    }
    const sub = services.resolve<SubscriptionService>('subscription')
    const devices = await sub.getDevices()
    return okResult(devices)
  })

  handleIpc(IpcChannel.SUBSCRIPTION_REMOVE_DEVICE, RemoveDeviceSchema, async (data) => {
    if (!services.has('subscription')) {
      return errResult('NOT_INITIALIZED', 'Subscription service not yet initialized')
    }
    const sub = services.resolve<SubscriptionService>('subscription')
    await sub.removeDevice(data.hwid)
    return okResult(undefined)
  })
}
