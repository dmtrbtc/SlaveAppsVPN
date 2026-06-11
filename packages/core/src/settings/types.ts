// Canonical domain types — the cluster that AppSettings aggregates. Ported from
// apps/windows/src/shared/ipc/types.ts so both platforms share one model; the
// Windows app re-exports these from core in P0.3.

import type { VPNMode } from '@slave-vpn/shared'
import type { DnsPresetName, DnsStrategyName, DnsProfileConfig } from '../dns/types.js'

export type SelectedEngine = 'mihomo' | 'singbox' | 'xray'
export type BalancerMode = 'latency' | 'stability' | 'balanced' | 'manual'

export type UtlsFingerprintName =
  | 'randomized'
  | 'random'
  | 'chrome'
  | 'firefox'
  | 'safari'
  | 'edge'
  | 'ios'
  | 'android'
  | '360'
  | 'qq'

// ─── Rule providers ───────────────────────────────────────────────────────────
export type RuleProviderType = 'domain-list' | 'ip-cidr-list' | 'clash-yaml' | 'geosite' | 'geoip' | 'mixed'
export type RuleProviderAction = 'proxy' | 'direct' | 'reject'
export type RuleSourceKind = 'github' | 'url' | 'builtin'

export interface RuleProvider {
  id: string
  name: string
  enabled: boolean
  kind: RuleSourceKind
  url: string
  type: RuleProviderType
  action: RuleProviderAction
  priority: number // 0-9999; lower = higher priority
  ruleCount?: number
  lastUpdatedAt?: number
  lastError?: string
  category?: string // 'russia-bypass' | 'streaming' | 'ai' | 'gaming' | 'privacy' | 'work' | 'custom'
  isPreset?: boolean // built-in preset, cannot be deleted
}

export interface RuleProviderAddInput {
  name: string
  url: string
  type: RuleProviderType
  action: RuleProviderAction
  category?: string
}

// ─── Profiles ──────────────────────────────────────────────────────────────────
export interface AppProfileSnapshot {
  subscriptionId?: string
  enabledScenarios?: string[]
  dnsPreset?: DnsPresetName
  dnsStrategy?: DnsStrategyName
  selectedEngine?: SelectedEngine
  selectedProxy?: string | null
  vpnMode?: VPNMode
  balancerEnabled?: boolean
}

export interface AppProfile {
  id: string
  name: string
  description?: string
  snapshot: AppProfileSnapshot
  createdAt: number
  lastUsedAt: number | null
}

// ─── Geo databases ───────────────────────────────────────────────────────────
export interface GeoSource {
  id: string
  label: string
  url: string
  filename: string // dest name inside rules dir
  minBytes: number // sanity floor for download validation
  category: 'geo-db' | 'domain-list'
}

export interface GeoUpdateRecord {
  id: string
  label: string
  filename: string
  bytes: number
  sha256: string
  updatedAt: number
}

export interface GeoUpdaterState {
  records: GeoUpdateRecord[]
  lastFullUpdateAt: number | null
  inProgress: boolean
  intervalHours: number
}

// ─── App settings (the aggregate) ─────────────────────────────────────────────
export interface AppSettings {
  language: 'ru' | 'en'
  vpnMode: VPNMode
  autoStart: boolean
  minimizeToTray: boolean
  notificationsEnabled: boolean
  autoConnect: boolean
  killSwitch: boolean
  apiBaseUrl: string
  telegramBotUsername: string
  devMode: boolean
  updateChannel: 'stable' | 'beta'
  selectedEngine: SelectedEngine
  dnsPreset: DnsPresetName
  dnsStrategy: DnsStrategyName
  customDnsProfile: DnsProfileConfig | null
  balancerEnabled: boolean
  balancerMode: BalancerMode
  autoSelectProxy: boolean
  selectedProxy: string | null
  splitProcessList: string[]
  // Split tunnel (per-app on Android; the splitProcessList carries the package
  // names there). 'off' = all traffic tunnels; 'include' = ONLY the listed apps
  // tunnel; 'exclude' = all apps EXCEPT the listed ones tunnel.
  splitTunnelMode: SplitTunnelMode
  ruleProviders: RuleProvider[]
  enabledScenarios: string[]
  utlsFingerprint: UtlsFingerprintName
}

export type SplitTunnelMode = 'off' | 'include' | 'exclude'
