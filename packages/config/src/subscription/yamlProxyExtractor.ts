import yaml from 'js-yaml'
import type { ProxyEntry } from './types'

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Re-parses clash-format YAML back into ProxyEntry[].
 * Used by aggregators that need to merge proxies from multiple sources.
 *
 * Note: this is round-trip-lossy by design — fields outside the well-known
 * shape go into `extra` so downstream code (e.g. buildClashYaml) can preserve them.
 */
export function parseProxiesFromYaml(yamlText: string): ProxyEntry[] {
  let parsed: unknown
  try {
    parsed = yaml.load(yamlText)
  } catch {
    return []
  }

  if (!isObject(parsed)) return []
  const proxiesRaw = parsed['proxies']
  if (!Array.isArray(proxiesRaw)) return []

  const entries: ProxyEntry[] = []
  for (const raw of proxiesRaw) {
    if (!isObject(raw)) continue

    const name = typeof raw['name'] === 'string' ? raw['name'] : undefined
    const type = typeof raw['type'] === 'string' ? raw['type'] : undefined
    const server = typeof raw['server'] === 'string' ? raw['server'] : undefined
    const port = typeof raw['port'] === 'number' ? raw['port'] : undefined

    if (!name || !type || !server || port === undefined) continue

    const transport = typeof raw['network'] === 'string' ? raw['network'] : undefined
    const tls = raw['tls'] === true
    const realityOpts = isObject(raw['reality-opts'])
    const securityType: 'reality' | 'tls' | undefined =
      realityOpts ? 'reality' : tls ? 'tls' : undefined

    const extra: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(raw)) {
      if (k === 'name' || k === 'type' || k === 'server' || k === 'port') continue
      extra[k] = v
    }

    const entry: ProxyEntry = {
      name,
      type,
      server,
      port,
      ...(transport ? { transport } : {}),
      ...(securityType ? { securityType } : {}),
      extra,
    }
    entries.push(entry)
  }

  return entries
}
