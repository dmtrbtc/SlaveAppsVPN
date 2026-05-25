import type { ParsedProxy } from '../../parser/ParsedProfile'
import type { SingboxOutbound, SingboxTlsConfig, SingboxTransport } from './types'

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v)
  return undefined
}

function asBool(v: unknown): boolean {
  return v === true || v === 'true'
}

function asObject(v: unknown): Record<string, unknown> | undefined {
  if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
    return v as Record<string, unknown>
  }
  return undefined
}

// ─── TLS ──────────────────────────────────────────────────────────────────────

function buildTls(proxy: ParsedProxy): SingboxTlsConfig | undefined {
  const tlsEnabled = asBool(proxy['tls'])
  const realityOpts = asObject(proxy['reality-opts'])
  const sni = asString(proxy['sni']) ?? asString(proxy['servername']) ?? asString(proxy['host'])
  const fingerprint = asString(proxy['client-fingerprint']) ?? asString(proxy['fingerprint'])
  const skipVerify = asBool(proxy['skip-cert-verify'])
  const alpn = Array.isArray(proxy['alpn']) ? (proxy['alpn'] as string[]).filter(a => typeof a === 'string') : undefined

  // Reality always implies TLS
  if (!tlsEnabled && !realityOpts) return undefined

  const tls: SingboxTlsConfig = { enabled: true }
  if (sni) tls.server_name = sni
  if (skipVerify) tls.insecure = true
  if (alpn && alpn.length > 0) tls.alpn = alpn

  if (fingerprint) {
    tls.utls = { enabled: true, fingerprint }
  }

  if (realityOpts) {
    const pbk = asString(realityOpts['public-key'])
    const sid = asString(realityOpts['short-id'])
    if (pbk) {
      tls.reality = { enabled: true, public_key: pbk, ...(sid ? { short_id: sid } : {}) }
      // Reality requires utls — default to chrome if no explicit fingerprint
      if (!tls.utls) tls.utls = { enabled: true, fingerprint: 'chrome' }
    }
  }

  return tls
}

// ─── Transport (ws / grpc / h2 / httpupgrade) ────────────────────────────────

function buildTransport(proxy: ParsedProxy): SingboxTransport | undefined {
  const network = asString(proxy['network']) ?? 'tcp'

  switch (network) {
    case 'tcp':
      return undefined  // default; no transport block

    case 'ws': {
      const opts = asObject(proxy['ws-opts'])
      const path = asString(opts?.['path']) ?? '/'
      const headersRaw = asObject(opts?.['headers']) ?? {}
      const headers: Record<string, string> = {}
      for (const [k, v] of Object.entries(headersRaw)) {
        if (typeof v === 'string') headers[k] = v
      }
      return {
        type: 'ws',
        path,
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
      }
    }

    case 'grpc': {
      const opts = asObject(proxy['grpc-opts'])
      const service = asString(opts?.['grpc-service-name']) ?? ''
      return {
        type: 'grpc',
        service_name: service,
      }
    }

    case 'h2': {
      const opts = asObject(proxy['h2-opts'])
      const path = asString(opts?.['path']) ?? '/'
      const hostList = Array.isArray(opts?.['host']) ? (opts!['host'] as unknown[]).filter(h => typeof h === 'string') as string[] : []
      return {
        type: 'http',
        path,
        ...(hostList.length > 0 ? { host: hostList } : {}),
      }
    }

    case 'httpupgrade': {
      const opts = asObject(proxy['ws-opts']) ?? asObject(proxy['http-upgrade-opts'])
      const path = asString(opts?.['path']) ?? '/'
      return {
        type: 'httpupgrade',
        path,
      }
    }

    default:
      return undefined
  }
}

// ─── Per-protocol compilers ──────────────────────────────────────────────────

function compileVless(proxy: ParsedProxy): SingboxOutbound | null {
  const server = asString(proxy['server'])
  const port = asNumber(proxy['port'])
  const uuid = asString(proxy['uuid'])
  if (!server || !port || !uuid) return null

  const out: SingboxOutbound = {
    type: 'vless',
    tag: proxy.name,
    server,
    server_port: port,
    uuid,
  }

  const flow = asString(proxy['flow'])
  if (flow) out.flow = flow

  const tls = buildTls(proxy)
  if (tls) out.tls = tls

  const transport = buildTransport(proxy)
  if (transport) out.transport = transport

  return out
}

function compileVmess(proxy: ParsedProxy): SingboxOutbound | null {
  const server = asString(proxy['server'])
  const port = asNumber(proxy['port'])
  const uuid = asString(proxy['uuid'])
  if (!server || !port || !uuid) return null

  const out: SingboxOutbound = {
    type: 'vmess',
    tag: proxy.name,
    server,
    server_port: port,
    uuid,
    security: asString(proxy['cipher']) ?? 'auto',
    alter_id: asNumber(proxy['alterId']) ?? asNumber(proxy['alter-id']) ?? 0,
  }

  const tls = buildTls(proxy)
  if (tls) out.tls = tls

  const transport = buildTransport(proxy)
  if (transport) out.transport = transport

  return out
}

function compileTrojan(proxy: ParsedProxy): SingboxOutbound | null {
  const server = asString(proxy['server'])
  const port = asNumber(proxy['port'])
  const password = asString(proxy['password'])
  if (!server || !port || !password) return null

  const out: SingboxOutbound = {
    type: 'trojan',
    tag: proxy.name,
    server,
    server_port: port,
    password,
  }

  // Trojan implies TLS; ensure it's set even if `tls: true` is absent
  const tls = buildTls(proxy) ?? { enabled: true }
  if (!tls.server_name) {
    const sni = asString(proxy['sni']) ?? asString(proxy['servername'])
    if (sni) tls.server_name = sni
  }
  out.tls = tls

  const transport = buildTransport(proxy)
  if (transport) out.transport = transport

  return out
}

function compileShadowsocks(proxy: ParsedProxy): SingboxOutbound | null {
  const server = asString(proxy['server'])
  const port = asNumber(proxy['port'])
  const method = asString(proxy['cipher'])
  const password = asString(proxy['password'])
  if (!server || !port || !method || !password) return null

  return {
    type: 'shadowsocks',
    tag: proxy.name,
    server,
    server_port: port,
    method,
    password,
  }
}

function compileHysteria2(proxy: ParsedProxy): SingboxOutbound | null {
  const server = asString(proxy['server'])
  const port = asNumber(proxy['port'])
  const password = asString(proxy['password']) ?? asString(proxy['auth'])
  if (!server || !port || !password) return null

  const out: SingboxOutbound = {
    type: 'hysteria2',
    tag: proxy.name,
    server,
    server_port: port,
    password,
  }

  const obfsType = asString(proxy['obfs'])
  const obfsPassword = asString(proxy['obfs-password'])
  if (obfsType) {
    out.obfs = { type: obfsType, ...(obfsPassword ? { password: obfsPassword } : {}) }
  }

  // Hysteria2 is QUIC over TLS; default-enable
  const tls = buildTls(proxy) ?? { enabled: true }
  if (!tls.server_name) {
    const sni = asString(proxy['sni'])
    if (sni) tls.server_name = sni
  }
  out.tls = tls

  return out
}

function compileTuic(proxy: ParsedProxy): SingboxOutbound | null {
  const server = asString(proxy['server'])
  const port = asNumber(proxy['port'])
  const uuid = asString(proxy['uuid'])
  if (!server || !port || !uuid) return null

  const out: SingboxOutbound = {
    type: 'tuic',
    tag: proxy.name,
    server,
    server_port: port,
    uuid,
    ...(asString(proxy['password']) ? { password: asString(proxy['password'])! } : {}),
    ...(asString(proxy['congestion-controller']) ? { congestion_control: asString(proxy['congestion-controller'])! } : {}),
  }

  const tls = buildTls(proxy) ?? { enabled: true }
  if (!tls.server_name) {
    const sni = asString(proxy['sni'])
    if (sni) tls.server_name = sni
  }
  out.tls = tls

  return out
}

function compileWireguard(proxy: ParsedProxy): SingboxOutbound | null {
  const server = asString(proxy['server'])
  const port = asNumber(proxy['port'])
  const privateKey = asString(proxy['private-key']) ?? asString(proxy['privateKey'])
  const publicKey = asString(proxy['public-key']) ?? asString(proxy['publicKey'])
  if (!server || !port || !privateKey || !publicKey) return null

  const ip = asString(proxy['ip']) ?? asString(proxy['address'])
  const ipv6 = asString(proxy['ipv6'])
  const local: string[] = []
  if (ip) local.push(ip.includes('/') ? ip : `${ip}/32`)
  if (ipv6) local.push(ipv6.includes('/') ? ipv6 : `${ipv6}/128`)

  return {
    type: 'wireguard',
    tag: proxy.name,
    server,
    server_port: port,
    private_key: privateKey,
    peer_public_key: publicKey,
    ...(asString(proxy['preshared-key']) ? { pre_shared_key: asString(proxy['preshared-key'])! } : {}),
    ...(local.length > 0 ? { local_address: local } : {}),
    ...(asNumber(proxy['mtu']) ? { mtu: asNumber(proxy['mtu'])! } : {}),
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export function compileOutbound(proxy: ParsedProxy): SingboxOutbound | null {
  switch (proxy.type) {
    case 'vless':       return compileVless(proxy)
    case 'vmess':       return compileVmess(proxy)
    case 'trojan':      return compileTrojan(proxy)
    case 'ss':
    case 'shadowsocks': return compileShadowsocks(proxy)
    case 'hysteria2':   return compileHysteria2(proxy)
    case 'tuic':        return compileTuic(proxy)
    case 'wireguard':   return compileWireguard(proxy)
    default:
      return null  // skip unknown protocols silently — caller decides whether to log
  }
}
