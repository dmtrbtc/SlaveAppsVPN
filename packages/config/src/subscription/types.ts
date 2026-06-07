export interface ProxyEntry {
  name: string
  type: string
  server: string
  port: number
  transport?: string     // tcp | ws | grpc | h2 | httpupgrade | udp
  securityType?: string  // reality | tls | none
  extra: Record<string, unknown>
}

export type SubscriptionFormat = 'clash-yaml' | 'singbox-json' | 'base64-links' | 'raw-links'

export interface NormalizedSubscription {
  yaml: string
  format: SubscriptionFormat
  proxyCount: number
}

export type ValidationSeverity = 'error' | 'warning'

export interface ValidationIssue {
  severity: ValidationSeverity
  field: string
  message: string
}

export interface CompatibilityReport {
  compatible: boolean
  issues: ValidationIssue[]
  proxyName: string
  protocol: string
}
