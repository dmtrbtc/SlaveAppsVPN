import { randomUUID } from 'crypto'
import { VPN, INITIAL_VPN_STATUS } from '@slave-vpn/shared'
import type { VPNStatus, VPNMode, VPNConnectionState } from '@slave-vpn/shared'
import { RuntimeManager } from '@slave-vpn/runtime'
import type { RuntimeState, HealthStatus } from '@slave-vpn/runtime'
import type { ConfigSource } from '@slave-vpn/provider'
import type { RuntimeService } from '../RuntimeService'
import type { AppSettings, RuntimeEvent, RuntimeEventKind, RuntimeEventSeverity, VpnHealthPayload } from '../../../shared/ipc/types'
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
    case 'idle':         return 'disconnected'
    case 'starting':     return 'connecting'
    case 'running':      return 'connected'
    case 'stopping':     return 'disconnecting'
    case 'crashed':      return 'reconnecting'
    case 'reconnecting': return 'reconnecting'
    case 'error':        return 'error'
  }
}

function makeEvent(
  kind: RuntimeEventKind,
  severity: RuntimeEventSeverity,
  message: string,
  metadata?: Record<string, unknown>
): RuntimeEvent {
  return { id: randomUUID(), kind, severity, timestamp: Date.now(), message, ...(metadata !== undefined ? { metadata } : {}) }
}

// Derives a degraded health state label from a HealthStatus snapshot.
// Used to produce the correct RuntimeEventKind on health transitions.
function classifyHealthDegradation(h: HealthStatus): RuntimeEventKind | null {
  if (!h.connectivityOk) return 'health.offline'
  if (!h.dnsOk) return 'health.dns_failure'
  if (!h.tunAvailable) return 'health.tunnel_unstable'
  const score =
    (h.processAlive ? 20 : 0) + (h.apiResponding ? 20 : 0) +
    (h.connectivityOk ? 20 : 0) + (h.dnsOk ? 20 : 0) +
    (h.tunAvailable ? 15 : 0) + (h.trafficActive ? 5 : 0)
  return score < 80 ? 'health.degraded' : null
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
  private lastHealthDegradation: RuntimeEventKind | null = null

  constructor(config: RuntimeServiceConfig) {
    this.manager = config.manager
    this.configSource = config.configSource
    this.getSettings = config.getSettings

    this.manager.on('stateChanged', ({ state }) => {
      if (state === 'running') {
        this.connectedAt = Date.now()
        this.lastError = null
        sendToRenderer(IpcChannel.EVENT_RUNTIME_EVENT,
          makeEvent('vpn.connected', 'info', 'VPN connected'))
      } else if (state === 'idle') {
        const wasConnected = this.connectedAt !== null
        this.connectedAt = null
        if (wasConnected) {
          sendToRenderer(IpcChannel.EVENT_RUNTIME_EVENT,
            makeEvent('vpn.disconnected', 'info', 'VPN disconnected'))
        }
      } else if (state === 'error') {
        this.connectedAt = null
        sendToRenderer(IpcChannel.EVENT_RUNTIME_EVENT,
          makeEvent('vpn.error', 'error', this.lastError ?? 'VPN error'))
      } else if (state === 'reconnecting' || state === 'crashed') {
        sendToRenderer(IpcChannel.EVENT_RUNTIME_EVENT,
          makeEvent('reconnect.attempt', 'warning', 'Attempting reconnect', { state }))
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
        sendToRenderer(IpcChannel.EVENT_RUNTIME_EVENT,
          makeEvent('vpn.error', 'critical', error.message, { fatal: true }))
      }
    })

    this.manager.on('healthChanged', ({ health }) => {
      const payload: VpnHealthPayload = {
        processAlive: health.processAlive,
        apiResponding: health.apiResponding,
        connectivityOk: health.connectivityOk,
        dnsOk: health.dnsOk,
        trafficActive: health.trafficActive,
        tunAvailable: health.tunAvailable,
        checkedAt: health.checkedAt,
      }
      sendToRenderer(IpcChannel.EVENT_VPN_HEALTH, payload)

      const degradationKind = classifyHealthDegradation(health)
      if (degradationKind !== this.lastHealthDegradation) {
        if (degradationKind !== null) {
          sendToRenderer(IpcChannel.EVENT_RUNTIME_EVENT,
            makeEvent(degradationKind, 'warning', `Connection health degraded: ${degradationKind}`))
        } else if (this.lastHealthDegradation !== null) {
          sendToRenderer(IpcChannel.EVENT_RUNTIME_EVENT,
            makeEvent('health.recovered', 'info', 'Connection health recovered'))
        }
        this.lastHealthDegradation = degradationKind
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
