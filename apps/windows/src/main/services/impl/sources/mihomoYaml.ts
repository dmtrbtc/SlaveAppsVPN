import { VPN } from '@slave-vpn/shared'

export interface ProxyEntry {
  name: string
  type: string
  server: string
  port: number
  transport?: string     // tcp | ws | grpc | h2 | httpupgrade
  securityType?: string  // reality | tls | none
  extra: Record<string, unknown>
}

// ─── YAML scalar serializer ───────────────────────────────────────────────────

function quoteYamlStr(s: string): string {
  if (s === '') return '""'
  if (
    /^(true|false|yes|no|on|off|null|~)$/i.test(s) ||
    /^[0-9]/.test(s) ||
    /^[&*!|>'"@`#?,\-{[\s]/.test(s) ||
    /[:{}[\],#&*!|>'"]/.test(s) ||
    /^\s|\s$/.test(s) ||
    s.includes('\n')
  ) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
  }
  return s
}

function serializeScalar(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') return quoteYamlStr(v)
  return String(v)
}

// ─── Single proxy → YAML block ────────────────────────────────────────────────

function proxyEntryToYaml(proxy: ProxyEntry): string {
  const lines: string[] = [`  - name: ${quoteYamlStr(proxy.name)}`]
  lines.push(`    type: ${proxy.type}`)
  lines.push(`    server: ${proxy.server}`)
  lines.push(`    port: ${proxy.port}`)

  for (const [key, val] of Object.entries(proxy.extra)) {
    if (val === undefined || val === null) continue

    if (typeof val === 'object' && !Array.isArray(val)) {
      lines.push(`    ${key}:`)
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        if (v !== undefined && v !== null) {
          lines.push(`      ${k}: ${serializeScalar(v)}`)
        }
      }
    } else if (Array.isArray(val)) {
      if (val.length === 0) continue
      lines.push(`    ${key}:`)
      for (const item of val) {
        lines.push(`      - ${serializeScalar(item)}`)
      }
    } else {
      lines.push(`    ${key}: ${serializeScalar(val)}`)
    }
  }

  return lines.join('\n')
}

// ─── Full Mihomo config ───────────────────────────────────────────────────────

export function buildMihomoYaml(proxies: ProxyEntry[]): string {
  if (proxies.length === 0) {
    throw new Error('Cannot build Mihomo YAML with zero proxies')
  }

  const proxyYaml = proxies.map(proxyEntryToYaml).join('\n')

  return [
    `mixed-port: ${VPN.MIHOMO_MIXED_PORT}`,
    `ipv6: false`,
    `allow-lan: false`,
    `mode: rule`,
    `log-level: warning`,
    ``,
    `dns:`,
    `  enable: true`,
    `  listen: 0.0.0.0:1053`,
    `  ipv6: false`,
    `  enhanced-mode: fake-ip`,
    `  fake-ip-range: 198.18.0.1/16`,
    `  fake-ip-filter:`,
    `    - "*.lan"`,
    `    - "*.local"`,
    `    - "*.localdomain"`,
    `  nameserver:`,
    `    - 223.5.5.5`,
    `    - 8.8.8.8`,
    `  fallback:`,
    `    - 1.1.1.1`,
    `    - 8.8.4.4`,
    ``,
    `proxies:`,
    proxyYaml,
    ``,
    `proxy-groups:`,
    `  - name: SLAVE`,
    `    type: select`,
    `    proxies:`,
    ...proxies.map(p => `      - ${quoteYamlStr(p.name)}`),
    ``,
    `rules:`,
    `  - MATCH,SLAVE`,
  ].join('\n')
}
