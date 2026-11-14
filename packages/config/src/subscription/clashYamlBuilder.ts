import { VPN } from '@slave-vpn/shared'
import yaml from 'js-yaml'
import type { ProxyEntry } from './types'

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

// ─── Full minimal Clash YAML from proxy list ──────────────────────────────────
// Used to normalize raw URI lists and sing-box configs into Clash format
// so ConfigGenerator can process them uniformly.

export function buildClashYaml(proxies: ProxyEntry[]): string {
  if (proxies.length === 0) {
    throw new Error('Cannot build Clash YAML with zero proxies')
  }

  const proxyYaml = yaml.dump({
    proxies: proxies.map(({ name, type, server, port, extra }) => ({
      name, type, server, port,
      ...Object.fromEntries(Object.entries(extra).filter(([, value]) =>
        value != null && (!Array.isArray(value) || value.length > 0))),
    })),
  }, { noRefs: true, lineWidth: -1 }).trimEnd()

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
