import fs from 'fs/promises'
import path from 'path'
import { sleep, VPN, EMPTY_TRAFFIC_STATS } from '@slave-vpn/shared'
import { generateMihomoConfig, getSelectGroupName } from '@slave-vpn/config'
import { RuntimeStateMachine } from '../state/RuntimeStateMachine'
import { EngineEventBus } from '../engine/EngineEvents'
import type { EngineEventName, EngineEventHandler, Unsubscribe } from '../engine/EngineEvents'
import type { VPNEngine, EngineInitConfig, ConnectionProfile } from '../engine/VPNEngine.interface'
import { EMPTY_HEALTH, type RuntimeState, type HealthStatus, type StopReason, type HotReloadType } from '../state/RuntimeState'
import type { TrafficStats } from '@slave-vpn/shared'
import { ProcessManager } from './ProcessManager'
import { MihomoApiClient } from './MihomoApiClient'
import { HealthMonitor } from './HealthMonitor'
import { TrafficMonitor } from './TrafficMonitor'

const API_READY_TIMEOUT_MS = 15_000
const API_POLL_INTERVAL_MS = 500

export class MihomoEngine implements VPNEngine {
  readonly engineType = 'mihomo' as const

  private _engineVersion: string | null = null
  private readonly fsm = new RuntimeStateMachine()
  private readonly events = new EngineEventBus()
  private readonly processManager = new ProcessManager(this.events)

  private initConfig: EngineInitConfig | null = null
  private currentProfile: ConnectionProfile | null = null
  private api: MihomoApiClient | null = null
  private healthMonitor: HealthMonitor | null = null
  private trafficMonitor: TrafficMonitor | null = null

  get engineVersion(): string | null {
    return this._engineVersion
  }

  async initialize(config: EngineInitConfig): Promise<void> {
    if (this.initConfig) throw new Error('MihomoEngine already initialized')
    this.initConfig = config
    this.api = new MihomoApiClient(config.apiPort, config.apiSecret)
    this.healthMonitor = new HealthMonitor(
      () => this.processManager.isRunning(),
      this.api,
      this.events,
      VPN.HEALTH_CHECK_INTERVAL_MS
    )
    this.trafficMonitor = new TrafficMonitor(this.api, this.events)
  }

  async start(profile: ConnectionProfile): Promise<void> {
    this.requireInitialized()
    const state = this.fsm.state
    if (state !== 'idle' && state !== 'error' && state !== 'reconnecting') {
      throw new Error(`Cannot start engine in state: ${state}`)
    }

    // Error is a terminal state — reset to idle before transitioning to starting
    if (state === 'error') {
      this.fsm.transition('idle', 'error_reset')
      this.events.emit('stateChanged', { state: 'idle' })
    }

    this.fsm.transition('starting')
    this.events.emit('stateChanged', { state: 'starting' })
    this.currentProfile = profile

    try {
      await this.writeConfig(profile)

      this.processManager.configure({
        binaryPath: this.initConfig!.binaryPath,
        workingDir: this.initConfig!.workingDir,
        configPath: this.configPath(),
        apiPort: this.initConfig!.apiPort,
        apiSecret: this.initConfig!.apiSecret,
      })

      await this.processManager.spawn((reason, code) => {
        this.onProcessExit(reason, code)
      })

      await this.waitForApi()

      try {
        const info = await this.api!.getVersion()
        this._engineVersion = info.version
      } catch { /* non-critical */ }

      if (profile.selectedProxy) {
        try {
          await this.api!.selectProxy(getSelectGroupName(), profile.selectedProxy)
        } catch { /* non-critical — proxy may not exist yet */ }
      }

      this.healthMonitor!.configure({
        mixedPort: profile.generatorSettings.mixedPort,
        ...(this.initConfig!.tunHooks !== undefined ? { tunHooks: this.initConfig!.tunHooks } : {}),
      })
      this.healthMonitor!.start()
      this.trafficMonitor!.start(() => this.healthMonitor!.notifyTrafficSeen())

      this.fsm.transition('running')
      this.events.emit('stateChanged', { state: 'running' })
    } catch (err) {
      await this.processManager.kill('intentional').catch(() => undefined)
      this.fsm.tryTransition('error', String(err))
      this.events.emit('stateChanged', { state: this.fsm.state })
      throw err
    }
  }

  async stop(reason: StopReason = 'intentional'): Promise<void> {
    if (this.fsm.state === 'idle') return

    this.healthMonitor?.stop()
    this.trafficMonitor?.stop()

    this.fsm.tryTransition('stopping', reason)
    this.processManager.setNextStopReason(reason)
    await this.processManager.kill(reason)

    this.fsm.tryTransition('idle')
    this.events.emit('stateChanged', { state: 'idle' })
  }

  async restart(reason: StopReason): Promise<void> {
    const profile = this.currentProfile
    if (!profile) throw new Error('No profile to restart with')

    const state = this.fsm.state

    if (state === 'crashed') {
      // Process already dead — transition through reconnecting before starting
      this.healthMonitor?.stop()
      this.trafficMonitor?.stop()
      this.fsm.transition('reconnecting', reason)
      this.events.emit('stateChanged', { state: 'reconnecting' })
    } else if (state === 'error') {
      // Error is a terminal state; reset to idle so start() can proceed
      this.fsm.transition('idle', 'restart')
      this.events.emit('stateChanged', { state: 'idle' })
    } else if (state !== 'idle') {
      await this.stop(reason)
    }

    await this.start(profile)
  }

  async probeLatency(tag: string, testUrl: string, timeoutMs: number): Promise<number | null> {
    if (this.fsm.state !== 'running' || !this.api) return null
    return this.api.getProxyDelay(tag, testUrl, timeoutMs)
  }

  async getConnections(): Promise<import('./MihomoApiClient').MihomoConnectionsInfo | null> {
    if (this.fsm.state !== 'running' || !this.api) return null
    try {
      return await this.api.getConnections()
    } catch {
      return null
    }
  }

  async closeConnection(id: string): Promise<void> {
    if (this.fsm.state !== 'running' || !this.api) return
    try {
      await this.api.closeConnection(id)
    } catch {
      // non-fatal
    }
  }

  async updateProfile(profile: ConnectionProfile): Promise<HotReloadType> {
    this.requireInitialized()
    if (!this.currentProfile) throw new Error('Engine not started')
    if (this.fsm.state !== 'running') throw new Error(`Cannot update profile in state: ${this.fsm.state}`)

    const reloadType = this.classifyProfileChange(this.currentProfile, profile)
    this.currentProfile = profile

    switch (reloadType) {
      case 'hot':
        if (profile.selectedProxy) {
          await this.api!.selectProxy(getSelectGroupName(), profile.selectedProxy)
        }
        break

      case 'reconnect':
        await this.writeConfig(profile)
        await this.api!.reloadConfig(this.configPath())
        await this.api!.closeAllConnections()
        if (profile.selectedProxy) {
          await this.api!.selectProxy(getSelectGroupName(), profile.selectedProxy).catch(() => undefined)
        }
        break

      case 'full_restart':
        await this.restart('config_reload')
        break
    }

    this.events.emit('reloadCompleted', { type: reloadType })
    return reloadType
  }

  getState(): RuntimeState {
    return this.fsm.state
  }

  getHealth(): HealthStatus {
    return this.healthMonitor?.getHealth() ?? { ...EMPTY_HEALTH }
  }

  getTraffic(): TrafficStats {
    return this.trafficMonitor?.getStats() ?? { ...EMPTY_TRAFFIC_STATS }
  }

  on<K extends EngineEventName>(event: K, handler: EngineEventHandler<K>): Unsubscribe {
    return this.events.on(event, handler)
  }

  async dispose(): Promise<void> {
    this.healthMonitor?.stop()
    this.trafficMonitor?.stop()
    await this.processManager.kill('intentional').catch(() => undefined)
    this.events.removeAll()
    this.fsm.forceReset()
    this._engineVersion = null
    this.currentProfile = null
  }

  private configPath(): string {
    return path.join(this.initConfig!.workingDir, 'config.yaml')
  }

  private async writeConfig(profile: ConnectionProfile): Promise<void> {
    const yaml = generateMihomoConfig({
      subscriptionYaml: profile.subscriptionYaml,
      ...(profile.selectedProxy !== undefined ? { selectedProxy: profile.selectedProxy } : {}),
      vpnMode: profile.vpnMode,
      settings: profile.generatorSettings,
      apiPort: this.initConfig!.apiPort,
      apiSecret: this.initConfig!.apiSecret,
      ...(profile.dnsProfile !== undefined ? { dnsProfile: profile.dnsProfile } : {}),
      ...(profile.routingPolicy !== undefined ? { routingPolicy: profile.routingPolicy } : {}),
      ...(this.initConfig!.rulesDir ? { rulesDir: this.initConfig!.rulesDir } : {}),
    })
    await fs.mkdir(this.initConfig!.workingDir, { recursive: true })
    await fs.writeFile(this.configPath(), yaml, 'utf-8')

    // Log generated config for production diagnostics (secret is obfuscated in yaml already)
    console.log(`[MihomoEngine] config written to: ${this.configPath()}`)
    console.log(`[MihomoEngine] config preview (first 2000 chars):\n${yaml.slice(0, 2000)}`)
  }

  private async waitForApi(): Promise<void> {
    const deadline = Date.now() + API_READY_TIMEOUT_MS
    while (Date.now() < deadline) {
      if (await this.api!.isAlive()) return
      await sleep(API_POLL_INTERVAL_MS)
    }
    throw new Error('Mihomo API did not become ready within timeout')
  }

  private onProcessExit(reason: StopReason, code: number | null): void {
    const state = this.fsm.state

    this.events.emit('stopped', { reason, exitCode: code })

    if (state === 'stopping') {
      // stop() is in control and will handle the state transition
      return
    }

    // Unexpected exit — clean up monitors and transition to crashed
    this.healthMonitor?.stop()
    this.trafficMonitor?.stop()

    if (this.fsm.tryTransition('crashed', reason)) {
      this.events.emit('stateChanged', { state: 'crashed' })
    }
  }

  private classifyProfileChange(prev: ConnectionProfile, next: ConnectionProfile): HotReloadType {
    const ps = prev.generatorSettings
    const ns = next.generatorSettings

    if (ps.tunEnabled !== ns.tunEnabled || ps.mixedPort !== ns.mixedPort) {
      return 'full_restart'
    }

    // tun stack swap requires full restart — driver-level reinit
    if (ps.tunStack !== ns.tunStack) {
      return 'full_restart'
    }

    if (
      prev.vpnMode === next.vpnMode &&
      prev.subscriptionYaml === next.subscriptionYaml &&
      ps.fakeIpEnabled === ns.fakeIpEnabled &&
      ps.dnsOverHttps === ns.dnsOverHttps &&
      JSON.stringify(ps.fallbackDns) === JSON.stringify(ns.fallbackDns) &&
      JSON.stringify(ps.splitTunnelProcesses) === JSON.stringify(ns.splitTunnelProcesses) &&
      JSON.stringify(prev.dnsProfile) === JSON.stringify(next.dnsProfile) &&
      JSON.stringify(prev.routingPolicy) === JSON.stringify(next.routingPolicy)
    ) {
      return 'hot'
    }

    return 'reconnect'
  }

  private requireInitialized(): void {
    if (!this.initConfig || !this.api) throw new Error('MihomoEngine not initialized — call initialize() first')
  }
}
