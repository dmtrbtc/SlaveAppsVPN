import type { ProxyEntry } from './types'

/**
 * Parser for the v2rayN / Xray "config array" subscription format:
 *
 *   [ { "remarks": "Slave-PL", "outbounds": [ { "protocol": "hysteria", ... } ], ... },
 *     { "remarks": "Slave-EE", "outbounds": [ { "protocol": "vless", ... } ], ... }, ... ]
 *
 * i.e. an ARRAY of full Xray configs, one per node, with the friendly name in
 * `remarks` and the proxy in the first non-utility `outbounds` entry.
 *
 * Some Remnawave panels serve Hysteria2 / TUIC ONLY in this format (it is absent
 * from the Clash and sing-box profiles). Our other parsers don't understand the
 * array-of-configs shape, so the node was invisible. UDP/QUIC entries are
 * translated to native Mihomo fields. TCP FinalMask entries retain the original
 * Xray outbound for an authenticated local bridge.
 */

const UTILITY_PROTOCOLS = new Set(['freedom', 'blackhole', 'dns', 'loopback'])

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined
}

export interface XrayFinalMaskProfile {
  name: string
  server: string
  port: number
  userId: string
  transport: 'tcp'
  outbound: Record<string, unknown>
}

export const XRAY_FINALMASK_OUTBOUND = 'slave-xray-finalmask'

export function parseXrayFinalMaskEntries(text: string): ProxyEntry[] {
  return parseXrayFinalMaskProfiles(text).map(profile => ({
    name: profile.name,
    type: 'vless',
    server: profile.server,
    port: profile.port,
    transport: 'tcp',
    extra: { uuid: profile.userId, network: 'tcp', [XRAY_FINALMASK_OUTBOUND]: profile.outbound },
  }))
}

/** Replace a stripped copy only if name, endpoint and VLESS identity match. */
export function mergeXrayFinalMaskEntries(primary: ProxyEntry[], masked: ProxyEntry[]): ProxyEntry[] {
  const nodes = [...primary]
  for (const entry of masked) {
    const index = nodes.findIndex(node => node.name === entry.name && node.type === 'vless' &&
      node.server === entry.server && node.port === entry.port && node.extra.uuid === entry.extra.uuid)
    if (index === -1) nodes.push(entry)
    else nodes[index] = entry
  }
  return nodes
}

/** Read standalone RAW VLESS outbounds with a TCP FinalMask from Remnawave.
 * Keep the complete outbound so the Xray runtime receives the mask as issued. */
export function parseXrayFinalMaskProfiles(text: string): XrayFinalMaskProfile[] {
  let parsed: unknown
  try { parsed = JSON.parse(text.trim()) } catch { return [] }
  if (!Array.isArray(parsed)) return []
  const profiles: XrayFinalMaskProfile[] = []
  for (const entry of parsed) {
    const config = asRecord(entry)
    if (!config || !Array.isArray(config.outbounds)) continue
    const name = typeof config.remarks === 'string' ? config.remarks : ''
    const outbound = config.outbounds.map(asRecord).find(item =>
      item && typeof item.protocol === 'string' && !UTILITY_PROTOCOLS.has(item.protocol))
    if (!name || !outbound || outbound.protocol !== 'vless') continue
    const stream = asRecord(outbound.streamSettings)
    const network = stream?.network ?? 'raw'
    const mask = asRecord(stream?.finalmask)
    if ((network !== 'raw' && network !== 'tcp') ||
        !Array.isArray(mask?.tcp) || mask.tcp.length === 0 || outbound.proxySettings != null ||
        asRecord(stream?.sockopt)?.dialerProxy != null) continue
    const settings = asRecord(outbound.settings)
    const vnext = Array.isArray(settings?.vnext) ? settings.vnext : undefined
    if (vnext && vnext.length !== 1) continue
    const destination = vnext ? asRecord(vnext[0]) : settings
    const users = Array.isArray(destination?.users) ? destination.users : undefined
    if (users && users.length !== 1) continue
    const user = users ? asRecord(users[0]) : destination
    const server = destination?.address
    const port = destination?.port
    const userId = user?.id
    if (typeof server !== 'string' || !server || typeof port !== 'number' ||
        !Number.isInteger(port) || port < 1 || port > 65535 ||
        typeof userId !== 'string' || !userId) continue
    profiles.push({ name, server, port, userId, transport: 'tcp', outbound })
  }
  return profiles
}

/** Detect the v2rayN/Xray array-of-configs shape without throwing. */
export function isXrayConfigArray(text: string): boolean {
  const t = text.trim()
  if (!t.startsWith('[')) return false
  try {
    const arr = JSON.parse(t)
    return Array.isArray(arr) && arr.some((c) => asRecord(c)?.['outbounds'] !== undefined)
  } catch {
    return false
  }
}

function convertXrayHysteria(name: string, ob: Record<string, unknown>): ProxyEntry | null {
  const s = asRecord(ob['settings'])
  const ss = asRecord(ob['streamSettings'])
  const server = String(s?.['address'] ?? '')
  const port = Number(s?.['port'] ?? 0)
  if (!server || !port) return null

  const hy = asRecord(ss?.['hysteriaSettings'])
  const version = Number(hy?.['version'] ?? s?.['version'] ?? 2)
  const password = String(hy?.['auth'] ?? hy?.['password'] ?? hy?.['authStr'] ?? '')

  const extra: Record<string, unknown> = { password }
  const tls = asRecord(ss?.['tlsSettings']) ?? asRecord(ss?.['realitySettings'])
  if (tls?.['serverName']) extra['sni'] = String(tls['serverName'])
  if (Array.isArray(tls?.['alpn'])) extra['alpn'] = tls['alpn']
  if (tls?.['allowInsecure']) extra['skip-cert-verify'] = true

  // mihomo distinguishes hysteria (v1) from hysteria2 (v2).
  const type = version >= 2 ? 'hysteria2' : 'hysteria'
  return { name: name || `${server}:${port}`, type, server, port, transport: 'udp', securityType: 'tls', extra }
}

function convertXrayTuic(name: string, ob: Record<string, unknown>): ProxyEntry | null {
  const s = asRecord(ob['settings'])
  const ss = asRecord(ob['streamSettings'])
  const server = String(s?.['address'] ?? '')
  const port = Number(s?.['port'] ?? 0)
  if (!server || !port) return null
  const tu = asRecord(ss?.['tuicSettings']) ?? s
  const extra: Record<string, unknown> = {
    uuid: String(tu?.['uuid'] ?? ''),
    password: String(tu?.['password'] ?? tu?.['auth'] ?? ''),
  }
  const tls = asRecord(ss?.['tlsSettings'])
  if (tls?.['serverName']) extra['sni'] = String(tls['serverName'])
  if (Array.isArray(tls?.['alpn'])) extra['alpn'] = tls['alpn']
  if (tls?.['allowInsecure']) extra['skip-cert-verify'] = true
  return { name: name || `${server}:${port}`, type: 'tuic', server, port, transport: 'udp', securityType: 'tls', extra }
}

/**
 * Parse a v2rayN/Xray config array, returning ONLY the UDP/QUIC protocol nodes
 * (hysteria/hysteria2/tuic). Returns [] for any other input. Never throws.
 */
export function parseXrayConfigArray(text: string): ProxyEntry[] {
  let arr: unknown
  try { arr = JSON.parse(text.trim()) } catch { return [] }
  if (!Array.isArray(arr)) return []

  const out: ProxyEntry[] = []
  for (const cfg of arr) {
    const c = asRecord(cfg)
    if (!c) continue
    const name = typeof c['remarks'] === 'string' ? (c['remarks'] as string) : ''
    const obs = Array.isArray(c['outbounds']) ? (c['outbounds'] as unknown[]) : []
    for (const o of obs) {
      const ob = asRecord(o)
      if (!ob) continue
      const proto = String(ob['protocol'] ?? '').toLowerCase()
      if (UTILITY_PROTOCOLS.has(proto)) continue
      let entry: ProxyEntry | null = null
      if (proto === 'hysteria' || proto === 'hysteria2' || proto === 'hy2') entry = convertXrayHysteria(name, ob)
      else if (proto === 'tuic') entry = convertXrayTuic(name, ob)
      // VLESS/Trojan/SS intentionally skipped — those come from the Clash profile
      // (which preserves REALITY encryption the Xray format may not).
      if (entry) out.push(entry)
    }
  }
  return out
}
