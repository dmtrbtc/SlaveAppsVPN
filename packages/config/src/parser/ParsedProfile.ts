export interface ParsedProxy {
  name: string
  type: string
  [key: string]: unknown
}

export interface ParsedProxyGroup {
  name: string
  type: string
  proxies: string[]
  url?: string
  interval?: number
  [key: string]: unknown
}

export interface ParsedProfile {
  proxies: ParsedProxy[]
  proxyGroups: ParsedProxyGroup[]
}
