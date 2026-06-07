import { CapacitorHttp } from '@capacitor/core'
import type { ProxyEntry } from '@slave-vpn/config'

/**
 * Non-native server latency (ping) — Task 1.
 *
 * HARD RULE: this MUST NOT touch the native VPN layer (clashbox / gojni). It
 * measures a TLS/HTTP round-trip to each node's edge via CapacitorHttp (OkHttp),
 * so it works WITHOUT the core loaded and never triggers an early native init.
 *
 * It is a *reachability + latency* indicator, not a proxy-throughput test:
 *   - TCP nodes (vless/trojan/ss): an HTTPS HEAD to host:port does a TLS RTT.
 *     Reality nodes forward unauthenticated handshakes to their masquerade dest,
 *     so the handshake usually completes; non-Reality TLS mismatches reject fast.
 *     Either way the elapsed time approximates the network RTT to the node edge.
 *   - UDP-only nodes (hysteria2/tuic on a UDP port): a TCP probe can't reach the
 *     UDP listener, so these typically read as 'timeout'. That is an honest
 *     fallback, not a failure of the node.
 *
 * Result per node: latency in ms, or null = timeout/unreachable (UI shows
 * "timeout"). Nothing here influences connect / auto-balancer / routing.
 */

export interface PingResult {
  name: string
  latencyMs: number | null
}

const DEFAULT_TIMEOUT_MS = 4000
const CONCURRENCY = 6

async function pingOne(server: string, port: number, timeoutMs: number): Promise<number | null> {
  if (!server || !port) return null
  const url = `https://${server}:${port}/`
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now())
  try {
    await CapacitorHttp.request({
      method: 'HEAD',
      url,
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
      // small UA; we only care about timing, not the body
      headers: { 'User-Agent': 'SlaveVPN-ping/1.0' },
    } as Parameters<typeof CapacitorHttp.request>[0])
    const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0
    return Math.round(elapsed)
  } catch {
    // A fast failure (TLS reset / cert mismatch / refused) still proves the host
    // answered within the network RTT → report elapsed. A failure that took ~the
    // whole timeout means unreachable → null ("timeout").
    const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0
    if (elapsed < timeoutMs * 0.9) return Math.round(elapsed)
    return null
  }
}

/**
 * Ping a batch of proxy entries (bounded concurrency). `onResult` is invoked as
 * each node finishes, so the UI can update live (drives the existing
 * serverLatency map → ms badges). Returns all results when done.
 */
export async function pingProxies(
  entries: Pick<ProxyEntry, 'name' | 'server' | 'port'>[],
  onResult?: (r: PingResult) => void,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<PingResult[]> {
  const out: PingResult[] = []
  let i = 0
  async function worker(): Promise<void> {
    while (i < entries.length) {
      const idx = i++
      const e = entries[idx]!
      const latencyMs = await pingOne(e.server, e.port, timeoutMs)
      const r: PingResult = { name: e.name, latencyMs }
      out.push(r)
      onResult?.(r)
    }
  }
  const workers = Array.from({ length: Math.min(CONCURRENCY, entries.length) }, () => worker())
  await Promise.all(workers)
  return out
}
