import yaml from 'js-yaml'
import type { ParsedProfile, ParsedProxy, ParsedProxyGroup } from './ParsedProfile'

interface RawSubscription {
  proxies?: unknown[]
  'proxy-groups'?: unknown[]
  [key: string]: unknown
}

export class SubscriptionParser {
  parse(subscriptionYaml: string): ParsedProfile {
    let raw: RawSubscription
    try {
      raw = yaml.load(subscriptionYaml) as RawSubscription
    } catch (err) {
      throw new Error(`Failed to parse subscription YAML: ${String(err)}`)
    }

    if (!raw || typeof raw !== 'object') {
      throw new Error('Invalid subscription: expected YAML object at root')
    }

    return {
      proxies: this.parseProxies(raw.proxies ?? []),
      proxyGroups: this.parseProxyGroups(raw['proxy-groups'] ?? []),
    }
  }

  private parseProxies(raw: unknown[]): ParsedProxy[] {
    return raw
      .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
      .map((p) => ({ name: String(p['name'] ?? ''), type: String(p['type'] ?? ''), ...p }))
      .filter((p) => p.name && p.type)
  }

  private parseProxyGroups(raw: unknown[]): ParsedProxyGroup[] {
    return raw
      .filter((g): g is Record<string, unknown> => typeof g === 'object' && g !== null)
      .map((g) => ({
        name: String(g['name'] ?? ''),
        type: String(g['type'] ?? ''),
        proxies: Array.isArray(g['proxies']) ? (g['proxies'] as unknown[]).map(String) : [],
        ...(g['url'] !== undefined ? { url: String(g['url']) } : {}),
        ...(g['interval'] !== undefined ? { interval: Number(g['interval']) } : {}),
        ...g,
      }))
      .filter((g) => g.name && g.type)
  }
}
