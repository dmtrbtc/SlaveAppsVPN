import { IpcChannel } from '../../../shared/ipc/channels'
import { EmptySchema } from '../../../shared/ipc/schemas'
import { errResult, okResult } from '../../../shared/ipc/types'
import { handleIpc, services } from '../registry'
import type { VPNProvider } from '@slave-vpn/provider'

export function registerProviderHandlers(): void {
  handleIpc(IpcChannel.PROVIDER_GET_MANIFEST, EmptySchema, async () => {
    if (!services.has('provider')) {
      return errResult('NOT_INITIALIZED', 'Provider not yet initialized')
    }
    const provider = services.resolve<VPNProvider>('provider')
    return okResult({
      id: provider.id,
      displayName: provider.displayName,
      description: '',
      version: '1.0.0',
      tier: 'verified' as const,
      capabilities: { ...provider.capabilities },
    })
  })

  handleIpc(IpcChannel.PROVIDER_GET_CAPABILITIES, EmptySchema, async () => {
    if (!services.has('provider')) {
      return errResult('NOT_INITIALIZED', 'Provider not yet initialized')
    }
    const provider = services.resolve<VPNProvider>('provider')
    return okResult({ ...provider.capabilities })
  })
}
