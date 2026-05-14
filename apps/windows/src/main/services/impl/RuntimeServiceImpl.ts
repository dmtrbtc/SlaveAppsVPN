import { VPN, INITIAL_VPN_STATUS } from '@slave-vpn/shared'
import type { VPNStatus, VPNMode, VPNConnectionState } from '@slave-vpn/shared'
import { RuntimeManager } from '@slave-vpn/runtime'
import type { RuntimeState } from '@slave-vpn/runtime'
import type { ConfigSource } from '@slave-vpn/provider'
import type { RuntimeService } from '../RuntimeService'
import type { AppSettings } from '../../../shared/ipc/types'
import { IpcChannel } from '../../../shared/ipc/channels'
import { sendToRenderer } from '../../window'

const DEFAULT_GENERATOR_SETTINGS = {
  tunEnabled: true,
  tunStack: 'mixed' as const,
  fakeIpEnabled: true,
  dnsOverHttps: 'https://8.8.8.8/dns-query',
  fallbackDns: ['8.8.8.8', '8.8.4.4'],
  mixedPort: VPN.MIHOMO_MIXED_PORT,
}

function engineStateToVpnState(state: RuntimeState): VPNConnectionState {
  switch (state) {
    case 'idle':      return 'disconnected'
    case 'starting':  return 'connecting'
    case 'running':   return 'connected'
    case 'stopping':  return 'disconnecting'
    case 'crashed':   return 'reconnecting'
    case 'reconnecting': return 'reconnecting'
    case 'error':     return 'error'
  }
}

export interface RuntimeServiceConfig {
  manager: RuntimeManager
  configSource: ConfigSource
  getSettings: () => AppSettings
}

export class RuntimeServiceImpl implements RuntimeService {
  private readonly manager: RuntimeManager
  private readonly configSource: ConfigSource
  private readonly getSettings: () => AppSettings

  private currentMode: VPNMode = 'bypass'
  private connectedAt: number | null = null
  private lastError: string | null = null

  constructor(config: RuntimeServiceConfig) {
    this.manager = config.manager
    this.configSource = config.configSource
    this.getSettings = config.getSettings

    this.manager.on('stateChanged', ({ state }) => {
      if (state === 'running') {
        this.connectedAt = Date.now()
        this.lastError = null
      } else if (state === 'idle' || state === 'error') {
        this.connectedAt = null
      }
      sendToRenderer(IpcChannel.EVENT_VPN_STATUS, this.getStatus())
    })

    this.manager.on('trafficUpdate', ({ stats }) => {
      sendToRenderer(IpcChannel.EVENT_VPN_TRAFFIC, stats)
    })

    this.manager.on('error', ({ error, fatal }) => {
      this.lastError = error.message
      if (fatal) {
        sendToRenderer(IpcChannel.EVENT_VPN_ERROR, {
          code: 'FATAL_ENGINE_ERROR',
          message: error.message,
        })
      }
    })
  }

  async connect(): Promise<void> {
    const settings = this.getSettings()
    this.currentMode = settings.vpnMode

    const subscriptionYaml = await this.configSource.fetchYaml()

    await this.manager.connect({
      subscriptionYaml,
      vpnMode: this.currentMode,
      generatorSettings: {
        ...DEFAULT_GENERATOR_SETTINGS,
        ...(this.currentMode === 'split'
          ? { splitTunnelProcesses: [] }
          : {}),
      },
    })
  }

  async disconnect(): Promise<void> {
    await this.manager.disconnect('intentional')
  }

  getStatus(): VPNStatus {
    const state = this.manager.getState()
    return {
      ...INITIAL_VPN_STATUS,
      state: engineStateToVpnState(state),
      mode: this.currentMode,
      connectedAt: this.connectedAt,
      lastError: this.lastError,
    }
  }

  async setMode(mode: VPNMode): Promise<void> {
    this.currentMode = mode

    if (this.manager.getState() === 'running') {
      await this.manager.updateProfile({
        subscriptionYaml: await this.configSource.fetchYaml(),
        vpnMode: mode,
        generatorSettings: {
          ...DEFAULT_GENERATOR_SETTINGS,
          ...(mode === 'split' ? { splitTunnelProcesses: [] } : {}),
        },
      })
    }
  }

  getEngineVersion(): string | null {
    return this.manager.getEngineVersion()
  }

  dispose(): Promise<void> {
    return this.manager.dispose()
  }
}
