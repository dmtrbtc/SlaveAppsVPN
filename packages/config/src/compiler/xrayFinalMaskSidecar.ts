import type { XrayFinalMaskProfile } from '../subscription/xrayArrayParser'

/** Build both ends of a local TCP bridge for one standalone FinalMask outbound. */
export function buildXrayFinalMaskSidecar(
  profile: XrayFinalMaskProfile,
  listener: { port: number; username: string; password: string },
): { xrayConfig: string; mihomoProxy: Record<string, unknown> } {
  const { port, username, password } = listener
  if (!Number.isInteger(port) || port < 1024 || port > 65535 ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(username) || !/^[A-Za-z0-9_-]{22,128}$/.test(password)) {
    throw new Error('Invalid FinalMask loopback listener settings')
  }
  const outbound = profile.outbound
  const stream = outbound.streamSettings as Record<string, unknown> | undefined
  const mask = stream?.finalmask as { tcp?: unknown } | undefined
  const network = stream?.network ?? 'raw'
  const security = stream?.security ?? 'none'
  if (outbound.protocol !== 'vless' || (network !== 'tcp' && network !== 'raw') ||
      !Array.isArray(mask?.tcp) || mask.tcp.length === 0 || outbound.proxySettings != null ||
      (security !== 'none' && security !== 'tls' && security !== 'reality') ||
      (stream?.sockopt as { dialerProxy?: unknown } | undefined)?.dialerProxy != null) {
    throw new Error('FinalMask requires a standalone VLESS/TCP outbound')
  }
  const host = '127.0.0.1'
  return {
    xrayConfig: JSON.stringify({
      log: { loglevel: 'error' },
      inbounds: [{ listen: host, port, protocol: 'socks', settings: {
        auth: 'password', accounts: [{ user: username, pass: password }], udp: false,
      } }],
      outbounds: [outbound],
    }),
    mihomoProxy: {
      name: profile.name, type: 'socks5', server: host, port, username, password, udp: false,
    },
  }
}
