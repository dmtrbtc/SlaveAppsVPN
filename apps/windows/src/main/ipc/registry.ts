import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { type ZodSchema } from 'zod'
import { validated } from '../security/IpcValidator'
import { type IpcResult } from '../../shared/ipc/types'
import { type IpcChannel } from '../../shared/ipc/channels'
import { getLogger } from '../logger'

type ServiceFactory<T> = () => T

class ServiceRegistry {
  private services = new Map<string, unknown>()

  register<T>(name: string, factory: ServiceFactory<T>): void {
    this.services.set(name, factory)
  }

  resolve<T>(name: string): T {
    const factory = this.services.get(name) as ServiceFactory<T> | undefined
    if (!factory) {
      throw new Error(`Service '${name}' is not registered. Initialize it before using IPC.`)
    }
    return factory()
  }

  has(name: string): boolean {
    return this.services.has(name)
  }
}

export const services = new ServiceRegistry()

export function handleIpc<TInput, TOutput>(
  channel: IpcChannel,
  schema: ZodSchema<TInput>,
  handler: (data: TInput, event: IpcMainInvokeEvent) => Promise<IpcResult<TOutput>>
): void {
  const wrappedHandler = validated(schema, handler)

  ipcMain.handle(channel, (event, rawData: unknown) => {
    getLogger().debug({ channel }, 'IPC invoke')
    return wrappedHandler(event, rawData)
  })
}

export function registerAllHandlers(): void {
  const log = getLogger()
  log.info('Registering IPC handlers...')

  import('./handlers/auth.handler').then(({ registerAuthHandlers }) => {
    registerAuthHandlers()
    log.debug('Auth IPC handlers registered')
  }).catch((err: unknown) => log.error({ err }, 'Failed to register auth handlers'))

  import('./handlers/vpn.handler').then(({ registerVpnHandlers }) => {
    registerVpnHandlers()
    log.debug('VPN IPC handlers registered')
  }).catch((err: unknown) => log.error({ err }, 'Failed to register VPN handlers'))

  import('./handlers/subscription.handler').then(({ registerSubscriptionHandlers }) => {
    registerSubscriptionHandlers()
    log.debug('Subscription IPC handlers registered')
  }).catch((err: unknown) => log.error({ err }, 'Failed to register subscription handlers'))

  import('./handlers/settings.handler').then(({ registerSettingsHandlers }) => {
    registerSettingsHandlers()
    log.debug('Settings IPC handlers registered')
  }).catch((err: unknown) => log.error({ err }, 'Failed to register settings handlers'))

  import('./handlers/diagnostics.handler').then(({ registerDiagnosticsHandlers }) => {
    registerDiagnosticsHandlers()
    log.debug('Diagnostics IPC handlers registered')
  }).catch((err: unknown) => log.error({ err }, 'Failed to register diagnostics handlers'))

  import('./handlers/provider.handler').then(({ registerProviderHandlers }) => {
    registerProviderHandlers()
    log.debug('Provider IPC handlers registered')
  }).catch((err: unknown) => log.error({ err }, 'Failed to register provider handlers'))

  log.info('IPC handlers registered')
}
