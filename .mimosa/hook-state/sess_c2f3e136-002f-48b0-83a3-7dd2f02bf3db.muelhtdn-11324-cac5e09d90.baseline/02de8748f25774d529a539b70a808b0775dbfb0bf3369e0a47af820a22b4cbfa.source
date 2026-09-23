import type { ProxyEntry } from './types'

// Minimal sing-box outbound shapes we care about

interface SingBoxOutbound {
  type: string
  tag?: string
  server?: string
  server_port?: number
  [key: string]: unknown
}

interface SingBoxConfig {
  outbounds?: SingBoxOutbound[]
  [key: string]: unknown
}

// Supported outbound types that map to Mihomo proxies
const PROXY_TYPES = new Set(['vless', 'vmess', 'trojan', 'shadowsocks', 'hysteria2', 'tuic', 'wireguard'])

function convertVless(ob: SingBoxOutbound): ProxyEntry | null {
  if (!ob.server || !ob.server_port) return null
  const name = ob.tag ?? `${ob.server}:${ob.server_port}`
  const uuid = String(ob.uuid ?? '')
  const flow = ob.flow ? String(ob.flow) : undefined

  const extra: Record<string, unknown> = { uuid, udp: true }
  if (flow) extra.flow = flow

  const tls = ob.tls as Record<string, unknown> | undefined
  let securityType = 'none'

  if (tls?.enabled) {
    extra.tls = true
    const serverName = tls.server_name as string | undefined
    if (serverName) extra.servername = serverName

    const reality = tls.reality as Record<string, unknown> | undefined
    if (reality?.enabled) {
      securityType = 'reality'
      const realityOpts: Record<string, string> = {}
      if (reality.public_key) realityOpts['public-key'] = String(reality.public_key)
      if (reality.short_id) realityOpts['short-id'] = String(reality.short_id)
      extra['reality-opts'] = realityOpts
    } else {
      securityType = 'tls'
    }

    const utls = tls.utls as Record<string, unknown> | undefined
    if (utls?.fingerprint) extra['client-fingerprint'] = String(utls.fingerprint)

    if (tls.insecure) extra['skip-cert-verify'] = true

    const alpn = tls.alpn as string[] | undefined
    if (alpn?.length) extra.alpn = alpn
  }

  const transport = ob.transport as Record<string, unknown> | undefined
  let networkType = 'tcp'

  if (transport) {
    const tType = String(transport.type ?? 'tcp')
    networkType = tType

    if (tType === 'ws') {
      extra.network = 'ws'
      const wsOpts: Record<string, unknown> = { path: String(transport.path ?? '/') }
      const headers = transport.headers as Record<string, string> | undefined
      if (headers?.Host) wsOpts.headers = { Host: headers.Host }
      extra['ws-opts'] = wsOpts
    } else if (tType === 'grpc') {
      extra.network = 'grpc'
      if (transport.service_name) extra['grpc-opts'] = { 'grpc-service-name': String(transport.service_name) }
    } else if (tType === 'http') {
      extra.network = 'h2'
      const h2Opts: Record<string, unknown> = {}
      if (transport.path) h2Opts.path = String(transport.path)
      if (transport.host) h2Opts.host = Array.isArray(transport.host) ? transport.host : [transport.host]
      extra['h2-opts'] = h2Opts
      networkType = 'h2'
    }
  }

  return {
    name,
    type: 'vless',
    server: String(ob.server),
    port: Number(ob.server_port),
    transport: networkType,
    securityType,
    extra,
  }
}

function convertTrojan(ob: SingBoxOutbound): ProxyEntry | null {
  if (!ob.server || !ob.server_port) return null
  const name = ob.tag ?? `${ob.server}:${ob.server_port}`
  const extra: Record<string, unknown> = {
    password: String(ob.password ?? ''),
    tls: true,
  }

  const tls = ob.tls as Record<string, unknown> | undefined
  if (tls?.server_name) extra.sni = String(tls.server_name)
  if (tls?.insecure) extra['skip-cert-verify'] = true
  const utls = tls?.utls as Record<string, unknown> | undefined
  if (utls?.fingerprint) extra['client-fingerprint'] = String(utls.fingerprint)

  return {
    name,
    type: 'trojan',
    server: String(ob.server),
    port: Number(ob.server_port),
    transport: 'tcp',
    securityType: 'tls',
    extra,
  }
}

function convertShadowsocks(ob: SingBoxOutbound): ProxyEntry | null {
  if (!ob.server || !ob.server_port) return null
  const name = ob.tag ?? `${ob.server}:${ob.server_port}`
  return {
    name,
    type: 'ss',
    server: String(ob.server),
    port: Number(ob.server_port),
    transport: 'tcp',
    securityType: 'none',
    extra: {
      cipher: String(ob.method ?? 'aes-256-gcm'),
      password: String(ob.password ?? ''),
      udp: true,
    },
  }
}

function convertHysteria2(ob: SingBoxOutbound): ProxyEntry | null {
  if (!ob.server || !ob.server_port) return null
  const name = ob.tag ?? `${ob.server}:${ob.server_port}`
  const extra: Record<string, unknown> = {
    password: String(ob.password ?? ''),
  }

  const tls = ob.tls as Record<string, unknown> | undefined
  if (tls?.server_name) extra.sni = String(tls.server_name)
  if (tls?.insecure) extra['skip-cert-verify'] = true

  const obfs = ob.obfs as Record<string, unknown> | undefined
  if (obfs?.type && obfs.type !== 'none') {
    extra.obfs = String(obfs.type)
    if (obfs.password) extra['obfs-password'] = String(obfs.password)
  }

  return {
    name,
    type: 'hysteria2',
    server: String(ob.server),
    port: Number(ob.server_port),
    transport: 'udp',
    securityType: 'tls',
    extra,
  }
}

function convertTuic(ob: SingBoxOutbound): ProxyEntry | null {
  if (!ob.server || !ob.server_port) return null
  const name = ob.tag ?? `${ob.server}:${ob.server_port}`
  const extra: Record<string, unknown> = {
    uuid: String(ob.uuid ?? ''),
    password: String(ob.password ?? ''),
    'congestion-controller': String(ob.congestion_control ?? 'bbr'),
    udp: true,
  }

  const tls = ob.tls as Record<string, unknown> | undefined
  if (tls?.server_name) extra.sni = String(tls.server_name)
  if (tls?.insecure) extra['skip-cert-verify'] = true
  const alpn = tls?.alpn as string[] | undefined
  if (alpn?.length) extra.alpn = alpn

  return {
    name,
    type: 'tuic',
    server: String(ob.server),
    port: Number(ob.server_port),
    transport: 'udp',
    securityType: 'tls',
    extra,
  }
}

function convertWireguard(ob: SingBoxOutbound): ProxyEntry | null {
  if (!ob.server || !ob.server_port) return null
  const name = ob.tag ?? `${ob.server}:${ob.server_port}`
  const extra: Record<string, unknown> = {
    'private-key': String(ob.private_key ?? ''),
    udp: true,
  }

  const peers = ob.peers as Array<Record<string, unknown>> | undefined
  if (peers?.[0]) {
    const peer = peers[0]
    if (peer.public_key) extra['public-key'] = String(peer.public_key)
    if (peer.allowed_ips) {
      const allowed = peer.allowed_ips as string[]
      if (allowed.length > 0) extra['allowed-ips'] = allowed
    }
  }

  const localAddress = ob.local_address as string[] | undefined
  if (localAddress?.[0]) extra.ip = localAddress[0]

  if (ob.mtu) extra.mtu = Number(ob.mtu)

  return {
    name,
    type: 'wireguard',
    server: String(ob.server),
    port: Number(ob.server_port),
    transport: 'udp',
    securityType: 'none',
    extra,
  }
}

function convertVmess(ob: SingBoxOutbound): ProxyEntry | null {
  if (!ob.server || !ob.server_port) return null
  const name = ob.tag ?? `${ob.server}:${ob.server_port}`
  const extra: Record<string, unknown> = {
    uuid: String(ob.uuid ?? ''),
    alterId: Number(ob.alter_id ?? ob.alterId ?? 0),
    cipher: 'auto',
    udp: true,
  }

  const tls = ob.tls as Record<string, unknown> | undefined
  if (tls?.enabled) {
    extra.tls = true
    if (tls.server_name) extra.servername = String(tls.server_name)
  }

  const transport = ob.transport as Record<string, unknown> | undefined
  let networkType = 'tcp'
  if (transport) {
    const tType = String(transport.type ?? 'tcp')
    networkType = tType
    if (tType === 'ws') {
      extra.network = 'ws'
      const wsOpts: Record<string, unknown> = { path: String(transport.path ?? '/') }
      const headers = transport.headers as Record<string, string> | undefined
      if (headers?.Host) wsOpts.headers = { Host: headers.Host }
      extra['ws-opts'] = wsOpts
    }
  }

  return {
    name,
    type: 'vmess',
    server: String(ob.server),
    port: Number(ob.server_port),
    transport: networkType,
    securityType: tls?.enabled ? 'tls' : 'none',
    extra,
  }
}

function convertOutbound(ob: SingBoxOutbound): ProxyEntry | null {
  switch (ob.type) {
    case 'vless':       return convertVless(ob)
    case 'vmess':       return convertVmess(ob)
    case 'trojan':      return convertTrojan(ob)
    case 'shadowsocks': return convertShadowsocks(ob)
    case 'hysteria2':   return convertHysteria2(ob)
    case 'tuic':        return convertTuic(ob)
    case 'wireguard':   return convertWireguard(ob)
    default:            return null
  }
}

export function isSingBoxJson(content: string): boolean {
  const trimmed = content.trimStart()
  if (!trimmed.startsWith('{')) return false
  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>
    return Array.isArray(obj.outbounds)
  } catch {
    return false
  }
}

export function parseSingBoxJson(content: string): ProxyEntry[] {
  let config: SingBoxConfig
  try {
    config = JSON.parse(content) as SingBoxConfig
  } catch {
    throw new Error('Invalid sing-box JSON: parse failed')
  }

  if (!Array.isArray(config.outbounds)) {
    throw new Error('Invalid sing-box JSON: missing outbounds array')
  }

  const seen = new Set<string>()
  const result: ProxyEntry[] = []

  for (const ob of config.outbounds) {
    if (!PROXY_TYPES.has(ob.type)) continue
    const entry = convertOutbound(ob)
    if (!entry) continue

    const key = `${entry.type}|${entry.server}|${entry.port}|${String(entry.extra.uuid ?? entry.extra.password ?? '')}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(entry)
  }

  return result
}
