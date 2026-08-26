import { CapacitorHttp } from '@capacitor/core'

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
 * CoreFacade owns batching and result events; this adapter measures one target.
 * Result per node: latency in ms, or null = timeout/unreachable (UI shows
 * "timeout"). Nothing here influences connect / auto-balancer / routing.
 */

const DEFAULT_TIMEOUT_MS = 4000

export async function probeProxyEdge(
  target: { server: string; port: number },
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<number | null> {
  const { server, port } = target
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
