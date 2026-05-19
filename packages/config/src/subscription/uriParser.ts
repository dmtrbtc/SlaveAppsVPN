import type { ProxyEntry } from './types'

// ─── VLESS ────────────────────────────────────────────────────────────────────

function parseVless(url: URL): ProxyEntry {
  const uuid = url.username
  const server = url.hostname
  const port = parseInt(url.port || '443', 10)
  const p = url.searchParams
  const name = decodeURIComponent(url.hash.slice(1)) || `${server}:${port}`
  const security = p.get('security') ?? 'none'
  const network = p.get('type') ?? 'tcp'

  const extra: Record<string, unknown> = { uuid, udp: true }

  if (security === 'tls' || security === 'reality') {
    extra.tls = true
  }

  const sni = p.get('sni')
  if (sni) extra.servername = sni

  const alpnStr = p.get('alpn')
  if (alpnStr) {
    const alpnList = alpnStr.split(',').map(s => s.trim()).filter(Boolean)
    if (alpnList.length > 0) extra.alpn = alpnList
  }

  if (p.get('allowInsecure') === '1' || p.get('insecure') === '1') {
    extra['skip-cert-verify'] = true
  }

  const fp = p.get('fp')
  if (fp) extra['client-fingerprint'] = fp

  if (security === 'reality') {
    const realityOpts: Record<string, string> = {}
    const pbk = p.get('pbk')
    const sid = p.get('sid')
    if (pbk) realityOpts['public-key'] = pbk
    if (sid !== null) realityOpts['short-id'] = sid
    extra['reality-opts'] = realityOpts
  }

  const flow = p.get('flow')
  if (flow) extra.flow = flow

  const packetEncoding = p.get('packetEncoding') ?? p.get('packet-encoding')
  if (packetEncoding && packetEncoding !== 'none') {
    extra['packet-encoding'] = packetEncoding
  }

  if (network === 'ws') {
    extra.network = 'ws'
    const wsOpts: Record<string, unknown> = { path: p.get('path') ?? '/' }
    const host = p.get('host')
    if (host) wsOpts.headers = { Host: host }
    extra['ws-opts'] = wsOpts
  } else if (network === 'grpc') {
    extra.network = 'grpc'
    const grpcOpts: Record<string, string> = {}
    const svcName = p.get('serviceName') ?? p.get('servicename') ?? p.get('service-name')
    if (svcName) grpcOpts['grpc-service-name'] = svcName
    extra['grpc-opts'] = grpcOpts
  } else if (network === 'h2') {
    extra.network = 'h2'
    const h2Opts: Record<string, unknown> = {}
    const h2Path = p.get('path')
    const h2Host = p.get('host')
    if (h2Path) h2Opts.path = h2Path
    if (h2Host) h2Opts.host = [h2Host]
    extra['h2-opts'] = h2Opts
  } else if (network === 'httpupgrade') {
    extra.network = 'httpupgrade'
    const httpOpts: Record<string, string> = {}
    const httpPath = p.get('path')
    const httpHost = p.get('host')
    if (httpPath) httpOpts.path = httpPath
    if (httpHost) httpOpts.host = httpHost
    extra['httpupgrade-opts'] = httpOpts
  }

  return { name, type: 'vless', server, port, transport: network, securityType: security, extra }
}

// ─── Trojan ───────────────────────────────────────────────────────────────────

function parseTrojan(url: URL): ProxyEntry {
  const password = decodeURIComponent(url.username)
  const server = url.hostname
  const port = parseInt(url.port || '443', 10)
  const p = url.searchParams
  const name = decodeURIComponent(url.hash.slice(1)) || `${server}:${port}`
  const network = p.get('type') ?? 'tcp'

  const extra: Record<string, unknown> = { password, tls: true }

  const sni = p.get('sni') ?? p.get('peer')
  if (sni) extra.sni = sni

  const fp = p.get('fp')
  if (fp) extra['client-fingerprint'] = fp

  if (p.get('allowInsecure') === '1' || p.get('insecure') === '1') {
    extra['skip-cert-verify'] = true
  }

  const alpnStr = p.get('alpn')
  if (alpnStr) {
    const alpnList = alpnStr.split(',').map(s => s.trim()).filter(Boolean)
    if (alpnList.length > 0) extra.alpn = alpnList
  }

  if (network === 'ws') {
    extra.network = 'ws'
    const wsOpts: Record<string, unknown> = { path: p.get('path') ?? '/' }
    const host = p.get('host')
    if (host) wsOpts.headers = { Host: host }
    extra['ws-opts'] = wsOpts
  } else if (network === 'grpc') {
    extra.network = 'grpc'
    const svcName = p.get('serviceName') ?? p.get('servicename')
    if (svcName) extra['grpc-opts'] = { 'grpc-service-name': svcName }
  }

  return { name, type: 'trojan', server, port, transport: network, securityType: 'tls', extra }
}

// ─── Shadowsocks ──────────────────────────────────────────────────────────────

function parseShadowsocks(url: URL): ProxyEntry {
  const server = url.hostname
  const port = parseInt(url.port || '8388', 10)
  const name = decodeURIComponent(url.hash.slice(1)) || `${server}:${port}`

  let method: string
  let password: string

  if (url.username && !url.password) {
    try {
      const decoded = Buffer.from(decodeURIComponent(url.username), 'base64').toString('utf-8')
      const sep = decoded.indexOf(':')
      method = decoded.slice(0, sep)
      password = decoded.slice(sep + 1)
    } catch {
      method = 'aes-256-gcm'
      password = decodeURIComponent(url.username)
    }
  } else {
    method = decodeURIComponent(url.username)
    password = decodeURIComponent(url.password)
  }

  const extra: Record<string, unknown> = { cipher: method, password, udp: true }

  const plugin = url.searchParams.get('plugin')
  if (plugin) {
    if (plugin.startsWith('obfs')) {
      extra['plugin'] = 'obfs'
      extra['plugin-opts'] = {
        mode: url.searchParams.get('obfs') ?? 'http',
        host: url.searchParams.get('obfs-host') ?? server,
      }
    } else if (plugin.startsWith('v2ray-plugin')) {
      extra['plugin'] = 'v2ray-plugin'
      extra['plugin-opts'] = {
        mode: url.searchParams.get('mode') ?? 'websocket',
        path: url.searchParams.get('path') ?? '/',
        host: url.searchParams.get('host') ?? server,
      }
    }
  }

  return { name, type: 'ss', server, port, transport: 'tcp', securityType: 'none', extra }
}

// ─── Hysteria2 ────────────────────────────────────────────────────────────────

function parseHysteria2(url: URL): ProxyEntry {
  const password = decodeURIComponent(url.username || url.password || '')
  const server = url.hostname
  const port = parseInt(url.port || '443', 10)
  const p = url.searchParams
  const name = decodeURIComponent(url.hash.slice(1)) || `${server}:${port}`

  const extra: Record<string, unknown> = { password }

  const sni = p.get('sni')
  if (sni) extra.sni = sni

  if (p.get('insecure') === '1' || p.get('allowInsecure') === '1') {
    extra['skip-cert-verify'] = true
  }

  const obfs = p.get('obfs')
  if (obfs && obfs !== 'none') {
    extra.obfs = obfs
    const obfsPass = p.get('obfs-password') ?? p.get('obfsParam')
    if (obfsPass) extra['obfs-password'] = obfsPass
  }

  return { name, type: 'hysteria2', server, port, transport: 'udp', securityType: 'tls', extra }
}

// ─── VMess ────────────────────────────────────────────────────────────────────

function parseVmess(link: string): ProxyEntry {
  const b64 = link.replace(/^vmess:\/\//i, '')
  let json: Record<string, unknown>
  try {
    json = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8')) as Record<string, unknown>
  } catch {
    throw new Error('Invalid VMess link: base64 decode or JSON parse failed')
  }

  const name = String(json.ps ?? json.add ?? 'vmess')
  const server = String(json.add ?? '')
  const port = parseInt(String(json.port ?? '443'), 10)
  const network = String(json.net ?? 'tcp')
  const security = String(json.tls ?? '')

  const extra: Record<string, unknown> = {
    uuid: String(json.id ?? ''),
    alterId: Number(json.aid ?? 0),
    cipher: 'auto',
    udp: true,
  }

  if (security === 'tls') {
    extra.tls = true
    if (json.sni) extra.servername = String(json.sni)
    else if (json.host) extra.servername = String(json.host)
  }

  if (network === 'ws') {
    extra.network = 'ws'
    const wsOpts: Record<string, unknown> = { path: String(json.path ?? '/') }
    const host = json.host as string | undefined
    if (host) wsOpts.headers = { Host: host }
    extra['ws-opts'] = wsOpts
  } else if (network === 'grpc') {
    extra.network = 'grpc'
    if (json.path) extra['grpc-opts'] = { 'grpc-service-name': String(json.path) }
  } else if (network === 'h2') {
    extra.network = 'h2'
    const h2Opts: Record<string, unknown> = {}
    if (json.path) h2Opts.path = String(json.path)
    if (json.host) h2Opts.host = [String(json.host)]
    extra['h2-opts'] = h2Opts
  }

  return {
    name,
    type: 'vmess',
    server,
    port,
    transport: network,
    securityType: security === 'tls' ? 'tls' : 'none',
    extra,
  }
}

// ─── TUIC ─────────────────────────────────────────────────────────────────────

function parseTuic(url: URL): ProxyEntry {
  const uuid = decodeURIComponent(url.username)
  const password = decodeURIComponent(url.password)
  const server = url.hostname
  const port = parseInt(url.port || '443', 10)
  const p = url.searchParams
  const name = decodeURIComponent(url.hash.slice(1)) || `${server}:${port}`

  const extra: Record<string, unknown> = {
    uuid,
    password,
    'congestion-controller': p.get('congestion_control') ?? p.get('cc') ?? 'bbr',
    udp: true,
  }

  const sni = p.get('sni')
  if (sni) extra.sni = sni

  const alpnStr = p.get('alpn')
  if (alpnStr) {
    const alpnList = alpnStr.split(',').map(s => s.trim()).filter(Boolean)
    if (alpnList.length > 0) extra.alpn = alpnList
  }

  if (p.get('disable_sni') === '1') extra['disable-sni'] = true
  if (p.get('allow_insecure') === '1') extra['skip-cert-verify'] = true

  const udpRelayMode = p.get('udp_relay_mode')
  if (udpRelayMode) extra['udp-relay-mode'] = udpRelayMode

  return { name, type: 'tuic', server, port, transport: 'udp', securityType: 'tls', extra }
}

// ─── WireGuard ────────────────────────────────────────────────────────────────
// URI format: wireguard://PRIVATE_KEY@HOST:PORT?publickey=PUB&address=CIDR&dns=IP#NAME

function parseWireGuard(url: URL): ProxyEntry {
  const privateKey = decodeURIComponent(url.username)
  const server = url.hostname
  const port = parseInt(url.port || '51820', 10)
  const p = url.searchParams
  const name = decodeURIComponent(url.hash.slice(1)) || `${server}:${port}`

  const extra: Record<string, unknown> = {
    'private-key': privateKey,
    udp: true,
  }

  const publicKey = p.get('publickey') ?? p.get('public-key') ?? p.get('pubkey')
  if (publicKey) extra['public-key'] = publicKey

  const address = p.get('address') ?? p.get('ip')
  if (address) extra.ip = address.split(',')[0]?.trim()

  const dns = p.get('dns')
  if (dns) {
    const dnsList = dns.split(',').map(s => s.trim()).filter(Boolean)
    if (dnsList.length > 0) extra.dns = dnsList
  }

  const mtu = p.get('mtu')
  if (mtu) extra.mtu = parseInt(mtu, 10)

  return { name, type: 'wireguard', server, port, transport: 'udp', securityType: 'none', extra }
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

const PROXY_SCHEME_RE = /^(vless|vmess|trojan|ss|hysteria2?|hy2|tuic|wireguard|wg):\/\//i

export function isProxyUri(s: string): boolean {
  return PROXY_SCHEME_RE.test(s.trim())
}

export function parseProxyUri(link: string): ProxyEntry {
  const trimmed = link.trim()
  const lower = trimmed.toLowerCase()

  if (lower.startsWith('vmess://')) return parseVmess(trimmed)

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new Error(`Cannot parse proxy URI: ${trimmed.slice(0, 80)}`)
  }

  const proto = url.protocol.replace(':', '').toLowerCase()

  switch (proto) {
    case 'vless':      return parseVless(url)
    case 'trojan':     return parseTrojan(url)
    case 'ss':         return parseShadowsocks(url)
    case 'hysteria':
    case 'hysteria2':
    case 'hy2':        return parseHysteria2(url)
    case 'tuic':       return parseTuic(url)
    case 'wireguard':
    case 'wg':         return parseWireGuard(url)
    default:
      throw new Error(`Unsupported proxy protocol: ${proto}`)
  }
}

export function parseProxyUriSafe(link: string): ProxyEntry | null {
  try {
    return parseProxyUri(link)
  } catch {
    return null
  }
}

export function parseProxyUriList(links: string[]): ProxyEntry[] {
  const seen = new Set<string>()
  const result: ProxyEntry[] = []

  for (const link of links) {
    const entry = parseProxyUriSafe(link)
    if (!entry) continue

    // Deduplicate by server+port+type
    const key = `${entry.type}|${entry.server}|${entry.port}|${String(entry.extra.uuid ?? entry.extra.password ?? '')}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(entry)
  }

  return result
}
