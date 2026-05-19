import type { ProxyEntry, CompatibilityReport, ValidationIssue } from './types'

// Valid TLS client fingerprints supported by Mihomo/xray
const VALID_FINGERPRINTS = new Set([
  'chrome', 'firefox', 'safari', 'ios', 'android',
  'edge', '360', 'qq', 'random', 'randomized',
])

// Valid VLESS flows for Mihomo
const VALID_FLOWS = new Set([
  'xtls-rprx-vision',
  'xtls-rprx-vision-udp443',
  '',
])

// Curve25519 public key: 32 bytes = 64 hex chars
const REALITY_PBK_RE = /^[0-9a-fA-F]{64}$/

// Reality short-id: 0–16 bytes = 0–32 hex chars (even length)
const REALITY_SID_RE = /^([0-9a-fA-F]{2})*$/

function validateVlessReality(proxy: ProxyEntry): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const realityOpts = proxy.extra['reality-opts'] as Record<string, unknown> | undefined

  if (!realityOpts) {
    issues.push({
      severity: 'error',
      field: 'reality-opts',
      message: 'security=reality but reality-opts is missing',
    })
    return issues
  }

  const pbk = realityOpts['public-key'] as string | undefined
  if (!pbk) {
    issues.push({ severity: 'error', field: 'reality-opts.public-key', message: 'Reality public key (pbk) is required' })
  } else if (!REALITY_PBK_RE.test(pbk)) {
    issues.push({
      severity: 'error',
      field: 'reality-opts.public-key',
      message: `Reality public key must be 64 hex chars (Curve25519), got ${pbk.length} chars`,
    })
  }

  const sid = realityOpts['short-id'] as string | undefined
  if (sid !== undefined && sid !== '' && !REALITY_SID_RE.test(sid)) {
    issues.push({
      severity: 'error',
      field: 'reality-opts.short-id',
      message: `Reality short-id must be hex with even length (0–32 chars), got: "${sid}"`,
    })
  }

  const fp = proxy.extra['client-fingerprint'] as string | undefined
  if (!fp) {
    issues.push({
      severity: 'warning',
      field: 'client-fingerprint',
      message: 'Reality should have a client fingerprint for camouflage (recommended: chrome)',
    })
  } else if (!VALID_FINGERPRINTS.has(fp)) {
    issues.push({
      severity: 'warning',
      field: 'client-fingerprint',
      message: `Unknown fingerprint "${fp}". Valid: ${[...VALID_FINGERPRINTS].join(', ')}`,
    })
  }

  const flow = proxy.extra.flow as string | undefined
  if (flow && !VALID_FLOWS.has(flow)) {
    issues.push({
      severity: 'warning',
      field: 'flow',
      message: `Unknown flow "${flow}". Valid: xtls-rprx-vision, xtls-rprx-vision-udp443`,
    })
  }

  if (!proxy.extra.servername && !proxy.extra.sni) {
    issues.push({
      severity: 'warning',
      field: 'servername',
      message: 'Reality should set SNI/servername for the destination server',
    })
  }

  return issues
}

function validateVlessTls(proxy: ProxyEntry): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  const fp = proxy.extra['client-fingerprint'] as string | undefined
  if (fp && !VALID_FINGERPRINTS.has(fp)) {
    issues.push({
      severity: 'warning',
      field: 'client-fingerprint',
      message: `Unknown fingerprint "${fp}". Valid: ${[...VALID_FINGERPRINTS].join(', ')}`,
    })
  }

  const skipVerify = proxy.extra['skip-cert-verify'] as boolean | undefined
  if (skipVerify) {
    issues.push({
      severity: 'warning',
      field: 'skip-cert-verify',
      message: 'TLS certificate verification is disabled — insecure in production',
    })
  }

  return issues
}

function validateVless(proxy: ProxyEntry): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const uuid = proxy.extra.uuid as string | undefined

  if (!uuid) {
    issues.push({ severity: 'error', field: 'uuid', message: 'VLESS UUID is required' })
  } else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) {
    issues.push({ severity: 'error', field: 'uuid', message: `Invalid UUID format: "${uuid}"` })
  }

  const security = proxy.securityType ?? 'none'
  if (security === 'reality') {
    issues.push(...validateVlessReality(proxy))
  } else if (security === 'tls') {
    issues.push(...validateVlessTls(proxy))
  }

  const flow = proxy.extra.flow as string | undefined
  if (flow && security !== 'reality' && security !== 'tls') {
    issues.push({
      severity: 'error',
      field: 'flow',
      message: 'XTLS flow requires security=reality or security=tls',
    })
  }

  return issues
}

function validateTrojan(proxy: ProxyEntry): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const password = proxy.extra.password as string | undefined
  if (!password) {
    issues.push({ severity: 'error', field: 'password', message: 'Trojan password is required' })
  }
  if (!proxy.extra.sni && !proxy.extra.servername) {
    issues.push({ severity: 'warning', field: 'sni', message: 'Trojan should set SNI for TLS validation' })
  }
  return issues
}

function validateHysteria2(proxy: ProxyEntry): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const password = proxy.extra.password as string | undefined
  if (!password) {
    issues.push({ severity: 'error', field: 'password', message: 'Hysteria2 password is required' })
  }
  return issues
}

function validateTuic(proxy: ProxyEntry): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const uuid = proxy.extra.uuid as string | undefined
  if (!uuid) {
    issues.push({ severity: 'error', field: 'uuid', message: 'TUIC UUID is required' })
  }
  const password = proxy.extra.password as string | undefined
  if (!password) {
    issues.push({ severity: 'error', field: 'password', message: 'TUIC password is required' })
  }
  return issues
}

function validateWireGuard(proxy: ProxyEntry): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!proxy.extra['private-key']) {
    issues.push({ severity: 'error', field: 'private-key', message: 'WireGuard private key is required' })
  }
  if (!proxy.extra['public-key']) {
    issues.push({ severity: 'error', field: 'public-key', message: 'WireGuard peer public key is required' })
  }
  if (!proxy.extra.ip) {
    issues.push({ severity: 'warning', field: 'ip', message: 'WireGuard interface IP address (ip) not set' })
  }
  return issues
}

// ─── Public API ───────────────────────────────────────────────────────────────

export class ConnectionCompatibilityValidator {
  validate(proxy: ProxyEntry): CompatibilityReport {
    const issues: ValidationIssue[] = []

    if (!proxy.server || proxy.server.trim() === '') {
      issues.push({ severity: 'error', field: 'server', message: 'Server address is empty' })
    }

    if (!proxy.port || proxy.port < 1 || proxy.port > 65535) {
      issues.push({ severity: 'error', field: 'port', message: `Invalid port: ${proxy.port}` })
    }

    switch (proxy.type) {
      case 'vless':      issues.push(...validateVless(proxy));     break
      case 'trojan':     issues.push(...validateTrojan(proxy));    break
      case 'hysteria2':  issues.push(...validateHysteria2(proxy)); break
      case 'tuic':       issues.push(...validateTuic(proxy));      break
      case 'wireguard':  issues.push(...validateWireGuard(proxy)); break
    }

    const hasErrors = issues.some(i => i.severity === 'error')

    return {
      compatible: !hasErrors,
      issues,
      proxyName: proxy.name,
      protocol: proxy.type,
    }
  }

  validateAll(proxies: ProxyEntry[]): Map<string, CompatibilityReport> {
    const reports = new Map<string, CompatibilityReport>()
    for (const proxy of proxies) {
      reports.set(proxy.name, this.validate(proxy))
    }
    return reports
  }

  // Returns only proxies that pass compatibility check (no error-severity issues)
  filterCompatible(proxies: ProxyEntry[]): ProxyEntry[] {
    return proxies.filter(p => this.validate(p).compatible)
  }
}
