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
 * array-of-configs shape, so the node was invisible. This parser extracts ONLY
 * the UDP/QUIC protocols (hysteria/hysteria2/tuic) — VLESS/Trojan continue to
 * come from the Clash profile (which preserves REALITY encryption). It maps to
 * mihomo-native ProxyEntry fields so the node both lists and connects.
 */

const UTILITY_PROTOCOLS = new Set(['freedom', 'blackhole', 'dns', 'loopback'])

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined
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
