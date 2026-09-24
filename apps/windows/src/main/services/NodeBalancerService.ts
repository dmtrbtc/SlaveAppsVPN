import { NodeBalancer } from '@slave-vpn/runtime'
import type { BalancerMode, LatencyProber } from '@slave-vpn/runtime'
import type { BalancerState } from '../../shared/ipc/types'
import { IpcChannel } from '../../shared/ipc/channels'
import { sendToRenderer } from '../window'
import { getLogger } from '../logger'

// Minimal NodeProber shim — uses MihomoApiClient via HTTP
class ApiProber {
  constructor(private apiPort: number, private apiSecret: string) {}

  async probe(proxyName: string, _url: string, timeoutMs: number): Promise<number | null> {
    try {
      const url = `http://127.0.0.1:${this.apiPort}/proxies/${encodeURIComponent(proxyName)}/delay?url=http%3A%2F%2Fwww.gstatic.com%2Fgenerate_204&timeout=${timeoutMs}`
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${this.apiSecret}` },
        signal: AbortSignal.timeout(timeoutMs + 1000),
      })
      if (!res.ok) return null
      const data = await res.json() as { delay?: number }
      return data.delay ?? null
    } catch {
      return null
    }
  }
}

export class NodeBalancerService {
  private balancer: NodeBalancer | null = null
  private proxyNames: string[] = []
  private proxyNamesProvider: (() => Promise<string[]>) | null = null

  constructor(
    private readonly apiPort: number,
    private readonly apiSecret: string,
  ) {}

  configure(proxyNames: string[]): void {
    this.proxyNames = proxyNames
  }

  /**
   * Lazy source of proxy names (aggregated subscription YAML → names). Without
   * it (or an explicit configure()) the balancer starts with an empty list and
   * immediately no-ops — which is exactly how it shipped dead until now.
   */
  setProxyNamesProvider(provider: () => Promise<string[]>): void {
    this.proxyNamesProvider = provider
  }

  private async ensureProxyNames(): Promise<void> {
    if (this.proxyNames.length > 0 || !this.proxyNamesProvider) return
    try {
      const names = await this.proxyNamesProvider()
      if (Array.isArray(names) && names.length > 0) this.proxyNames = names
    } catch (err) {
      getLogger().warn({ err }, 'Balancer proxy-names provider failed')
    }
  }

  async setEnabled(enabled: boolean): Promise<void> {
    if (!this.balancer) this.initBalancer()
    this.balancer!.configure({ enabled })
    if (enabled) {
      await this.ensureProxyNames()
      this.balancer!.start(this.proxyNames)
    } else {
      this.balancer!.stop()
    }
    this.emitState()
  }

  async setMode(mode: BalancerMode): Promise<void> {
    if (!this.balancer) this.initBalancer()
    this.balancer!.configure({ mode })
    this.emitState()
  }

  async probeAll(): Promise<void> {
    if (!this.balancer) this.initBalancer()
    await this.ensureProxyNames()
    await this.balancer!.probeAll(this.proxyNames)
    this.emitState()
  }

  getState(): BalancerState {
    if (!this.balancer) {
      return {
        enabled: false,
        mode: 'balanced',
        currentBest: null,
        lastRebalanceAt: null,
        probeIntervalMs: 60_000,
        nodes: [],
      }
    }
    return this.balancer.getState()
  }

  private initBalancer(): void {
    const proberShim: LatencyProber = new ApiProber(this.apiPort, this.apiSecret)
    this.balancer = new NodeBalancer(proberShim, null)
    this.balancer.onSelect((name) => {
      getLogger().info({ name }, 'Balancer selected best node')
      sendToRenderer(IpcChannel.EVENT_PROXY_CHANGED, name)
      sendToRenderer(IpcChannel.EVENT_BALANCER_STATE, this.getState())
    })
  }

  private emitState(): void {
    sendToRenderer(IpcChannel.EVENT_BALANCER_STATE, this.getState())
  }

  stop(): void {
    this.balancer?.stop()
  }
}

let _instance: NodeBalancerService | null = null

export function getNodeBalancerService(apiPort: number, apiSecret: string): NodeBalancerService {
  if (!_instance) {
    _instance = new NodeBalancerService(apiPort, apiSecret)
  }
  return _instance
}
