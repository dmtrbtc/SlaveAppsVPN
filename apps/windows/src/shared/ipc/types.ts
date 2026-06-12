import type {
  AuthTokens,
  User,
  Subscription,
  Device,
  Server,
  VPNStatus,
  VPNMode,
  TrafficStats,
} from '@slave-vpn/shared'

// ─── Result envelope ──────────────────────────────────────────────────────────

export type IpcOk<T> = { ok: true; data: T }
export type IpcErr = { ok: false; error: { code: string; message: string } }
export type IpcResult<T> = IpcOk<T> | IpcErr

export function okResult<T>(data: T): IpcOk<T> {
  return { ok: true, data }
}

export function errResult(code: string, message: string): IpcErr {
  return { ok: false, error: { code, message } }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginEmailPayload {
  email: string
  password: string
}

export interface LoginTelegramPayload {
  initData: string
}

export type AuthLoginResult = IpcResult<AuthTokens>
export type AuthMeResult = IpcResult<User>
export type AuthLogoutResult = IpcResult<void>

// ─── Personal cabinet (bedolaga) ────────────────────────────────────────────
// Renderer-facing DTOs. Structurally mirror @slave-vpn/core CabinetUser /
// CabinetSubscription so the bridge impls can return core objects directly.
// SECURITY: the raw subscription URL is NEVER exposed here — auto-import keeps
// it in the main process / bridge only.

export interface CabinetUserInfo {
  id: number
  telegramId: number | null
  username: string | null
  firstName: string | null
  lastName: string | null
  email: string | null
  emailVerified: boolean
  balanceKopeks: number
  balanceRubles: number
  referralCode: string | null
  language: string
  createdAt: string
  authType: string
}

export interface CabinetSubscriptionInfo {
  id: number
  status: string
  isTrial: boolean
  startDate: string
  endDate: string
  daysLeft: number
  hoursLeft: number
  minutesLeft: number
  timeLeftDisplay: string
  trafficLimitGb: number
  trafficUsedGb: number
  trafficUsedPercent: number
  deviceLimit: number
  autopayEnabled: boolean
  isActive: boolean
  isExpired: boolean
  isLimited: boolean
  tariffName: string | null
}

export interface CabinetSubscriptionStatusInfo {
  hasSubscription: boolean
  subscription: CabinetSubscriptionInfo | null
}

export interface CabinetDeepLinkInfo {
  token: string
  botUsername: string
  expiresIn: number
  /** The bot's expected /start payload: `webauth_<token>`. */
  startParam: string
  tgLink: string
}

export type CabinetPollOutcome =
  | { status: 'pending' }
  | { status: 'confirmed'; user: CabinetUserInfo }
  | { status: 'expired' }

export interface CabinetPollPayload { token: string }
export interface CabinetLoginEmailPayload { email: string; password: string }

export type CabinetAuthStateResult = IpcResult<{ authenticated: boolean }>
export type CabinetRequestDeepLinkResult = IpcResult<CabinetDeepLinkInfo>
export type CabinetPollDeepLinkResult = IpcResult<CabinetPollOutcome>
export type CabinetLoginEmailResult = IpcResult<CabinetUserInfo>
export type CabinetGetMeResult = IpcResult<CabinetUserInfo>
export type CabinetGetSubscriptionResult = IpcResult<CabinetSubscriptionStatusInfo>
export type CabinetImportSubscriptionResult = IpcResult<{ imported: boolean }>
export type CabinetLogoutResult = IpcResult<void>

// ─── VPN ─────────────────────────────────────────────────────────────────────

export interface VpnSetModePayload {
  mode: VPNMode
}

export type VpnConnectResult = IpcResult<void>
export type VpnDisconnectResult = IpcResult<void>
export type VpnGetStatusResult = IpcResult<VPNStatus>

// ─── Subscription ─────────────────────────────────────────────────────────────

export interface RemoveDevicePayload {
  hwid: string
}

export type SubscriptionGetResult = IpcResult<Subscription>
export type SubscriptionGetDevicesResult = IpcResult<Device[]>
export type SubscriptionRemoveDeviceResult = IpcResult<void>

// ─── Settings ─────────────────────────────────────────────────────────────────

export type SelectedEngine = 'mihomo' | 'singbox' | 'xray'

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
  // New settings fields
  dnsPreset: DnsPresetName
  dnsStrategy: DnsStrategyName
  customDnsProfile: DnsProfileConfig | null
  balancerEnabled: boolean
  balancerMode: BalancerMode
  autoSelectProxy: boolean
  selectedProxy: string | null
  splitProcessList: string[]
  splitTunnelMode: SplitTunnelMode
  ruleProviders: RuleProvider[]
  // Routing scenarios (Karing-style recipes; A.3)
  enabledScenarios: string[]
  // uTLS fingerprint used by sing-box / Mihomo when establishing TLS to
  // remote servers. "randomized" rotates the Client Hello on every
  // handshake — anti-DPI baseline since ТСПУ behavioural filtering (2026).
  utlsFingerprint: UtlsFingerprintName
}

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

export type SettingsGetResult = IpcResult<AppSettings>
export type SettingsSetResult = IpcResult<void>

// ─── Diagnostics ─────────────────────────────────────────────────────────────

export interface SystemInfo {
  platform: string
  arch: string
  osVersion: string
  appVersion: string
  mihomoVersion: string | null
  totalMemoryMb: number
  freeMemoryMb: number
  uptime: number
}

export interface LogEntry {
  level: string
  time: number
  msg: string
  [key: string]: unknown
}

export type DiagnosticsCollectResult = IpcResult<SystemInfo>
export type DiagnosticsExportLogsResult = IpcResult<string>

// ─── Self-test ────────────────────────────────────────────────────────────────

export type SelfTestStatus = 'ok' | 'warning' | 'error' | 'skipped'

export interface SelfTestCheck {
  id: string
  label: string
  status: SelfTestStatus
  detail: string
  durationMs: number
}

export interface SelfTestReport {
  checks: SelfTestCheck[]
  overall: SelfTestStatus
  ranAt: number
  totalMs: number
}

export type DiagnosticsSelfTestResult = IpcResult<SelfTestReport>

export interface StartupPhaseEntry {
  phase: string
  label: string
  startedAt: number
  completedAt: number | null
  durationMs: number | null
  error?: string
}

export interface StartupReport {
  phases: StartupPhaseEntry[]
  totalMs: number
  appStartedAt: number
  completedAt: number | null
}

export type DiagnosticsGetStartupResult = IpcResult<StartupReport>
export type DiagnosticsGetLogsResult = IpcResult<LogEntry[]>

// ─── Provider ─────────────────────────────────────────────────────────────────

export type ProviderTier = 'community' | 'verified' | 'official'

export interface ProviderCapabilitiesPayload {
  telegramAuth: boolean
  emailAuth: boolean
  payments: boolean
  multiDevice: boolean
  serverSelection: boolean
  trialAvailable: boolean
}

export interface ProviderManifestPayload {
  id: string
  displayName: string
  description: string
  version: string
  tier: ProviderTier
  capabilities: ProviderCapabilitiesPayload
  logoUrl?: string
  website?: string
  support?: string
  telegram?: string
}

export type ProviderGetManifestResult = IpcResult<ProviderManifestPayload>
export type ProviderGetCapabilitiesResult = IpcResult<ProviderCapabilitiesPayload>

// ─── Health ───────────────────────────────────────────────────────────────────

export interface VpnHealthPayload {
  processAlive: boolean
  apiResponding: boolean
  connectivityOk: boolean
  dnsOk: boolean
  trafficActive: boolean
  tunAvailable: boolean
  checkedAt: number
}

// ─── Runtime Event Bus ────────────────────────────────────────────────────────
// Typed taxonomy for runtime events forwarded to the renderer.
// Severity drives notification level and log retention policy.

export type RuntimeEventSeverity = 'debug' | 'info' | 'warning' | 'error' | 'critical'

export type RuntimeEventKind =
  | 'vpn.state_changed'
  | 'vpn.connected'
  | 'vpn.disconnected'
  | 'vpn.error'
  | 'vpn.preflight_warn'
  | 'vpn.preflight_failed'
  | 'health.degraded'
  | 'health.recovered'
  | 'health.dns_failure'
  | 'health.tunnel_unstable'
  | 'health.offline'
  | 'reconnect.attempt'
  | 'reconnect.success'
  | 'reconnect.exhausted'
  | 'sleep.suspend'
  | 'sleep.resume'
  | 'proxy.reality_error'
  | 'proxy.flow_error'
  | 'proxy.tls_error'
  | 'proxy.dns_error'
  | 'proxy.connection_refused'
  | 'proxy.timeout'
  | 'proxy.encryption_error'
  | 'proxy.selected'
  | 'connection.opened'
  | 'connection.closed'
  | 'rules.updated'

export interface RuntimeEvent {
  id: string
  kind: RuntimeEventKind
  severity: RuntimeEventSeverity
  timestamp: number
  message: string
  metadata?: Record<string, unknown>
}

// ─── Events (main → renderer) ────────────────────────────────────────────────

export interface UpdateAvailablePayload {
  version: string
  releaseNotes: string | null
}

export interface NotificationPayload {
  title: string
  body: string
  type: 'info' | 'success' | 'warning' | 'error'
}

// ─── Config Source ────────────────────────────────────────────────────────────

export type ConfigSourceType = 'provider' | 'subscription-url' | 'single-proxy' | 'remnawave-key'

export interface ConfigSourceMeta {
  type: ConfigSourceType
  displayName: string
  urlDomain?: string
  proxyProtocol?: string
  addedAt: number
}

export interface ConfigSourceSetPayload {
  type: ConfigSourceType
  input: string
}

export interface ConfigSourceValidatePayload {
  type: ConfigSourceType
  input: string
}

export interface NodePreview {
  name: string
  protocol: string
  transport: string
  security: string
}

export interface ConfigSourceValidateResult {
  valid: boolean
  displayName?: string
  error?: string
  nodeCount?: number
  protocols?: Record<string, number>
  sampleNodes?: NodePreview[]
}

export type ConfigSourceGetMetaResult = IpcResult<ConfigSourceMeta | null>
export type ConfigSourceSetResult = IpcResult<ConfigSourceMeta>
export type ConfigSourceValidateResultEnvelope = IpcResult<ConfigSourceValidateResult>
export type ConfigSourceClearResult = IpcResult<void>

// ─── Servers ──────────────────────────────────────────────────────────────────

export type ServersListResult = IpcResult<Server[]>
export type ServersProbeResult = IpcResult<void>

// ─── Server latency event (main → renderer) ──────────────────────────────────

export interface ServerLatencyPayload {
  proxyName: string            // matches Server.name / ProxyEntry.name
  latencyMs: number | null     // null = failed
  success: boolean
  score: number                // 0-100 health score
}

// ─── Connectivity snapshot ───────────────────────────────────────────────────

export interface VPNConnectivityInfo {
  engineState: string          // RuntimeState: idle|starting|running|stopping|crashed|error
  processAlive: boolean
  apiResponding: boolean
  tunAvailable: boolean
  connectivityOk: boolean
  dnsOk: boolean
  trafficActive: boolean
  activeProxy: string | null   // currently selected proxy name
  proxyCount: number           // available proxies in subscription
  healthScore: number          // 0-100 composite score
  checkedAt: number
  captivePortal?: boolean      // captive portal detected
  quarantinedNodes?: number    // nodes currently quarantined by NodeHealthManager
  suggestion?: string          // actionable hint for degraded state
  realityStatus?: 'reality' | 'tls' | 'none'  // security type of active proxy
  apiUrl?: string              // Mihomo API base URL when running
}

export type VpnGetConnectivityResult = IpcResult<VPNConnectivityInfo | null>

// ─── Safe Mode ───────────────────────────────────────────────────────────────

export interface SafeModeStatus {
  active: boolean
  launchCount: number
}

export type SafeModeGetStatusResult = IpcResult<SafeModeStatus>
export type SafeModeResetResult = IpcResult<void>

// ─── Runtime controls ─────────────────────────────────────────────────────────

export type RuntimeRestartResult = IpcResult<void>

// ─── Cache ────────────────────────────────────────────────────────────────────

export type CacheClearResult = IpcResult<void>

// ─── Updates ─────────────────────────────────────────────────────────────────

export type UpdateChannel = 'stable' | 'beta'
export type UpdateState = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'ready' | 'error'

export interface UpdateStatus {
  state: UpdateState
  channel: UpdateChannel
  currentVersion: string
  availableVersion: string | null
  downloadProgress: number
  error: string | null
  releaseNotes: string | null
  checkedAt: number | null
}

export interface UpdateCheckPayload {
  hasUpdate: boolean
  version: string | null
}

export interface UpdateSetChannelPayload {
  channel: UpdateChannel
}

export type UpdateGetStatusResult = IpcResult<UpdateStatus>
export type UpdateCheckResult = IpcResult<UpdateCheckPayload>
export type UpdateDownloadResult = IpcResult<void>
export type UpdateInstallResult = IpcResult<void>
export type UpdateSetChannelResult = IpcResult<void>

export interface UpdateProgressPayload {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

// ─── VPN Extended ────────────────────────────────────────────────────────────

export interface VpnSetProxyPayload {
  proxyName: string
}

export interface ProxyEntry {
  name: string
  type: string        // vless | vmess | trojan | ss | hysteria2 | tuic
  server: string
  port?: number
  transport?: string  // tcp | ws | grpc | h2
  security?: string   // reality | tls | none
  latencyMs?: number | null
  healthScore?: number
  countryCode?: string
  isFavorite?: boolean
  isAuto?: boolean    // special: AUTO group entry
  group?: string      // which group this belongs to
}

export type VpnSetProxyResult = IpcResult<void>
export type VpnGetProxyListResult = IpcResult<ProxyEntry[]>

// ─── Active connections (Mihomo /connections) ────────────────────────────────

export interface ActiveConnection {
  id: string
  host: string             // metadata.host or destinationIP fallback
  network: string          // tcp | udp
  type: string             // HTTP / HTTPS / Socks5 / TUN
  destinationIP: string
  destinationPort: string
  sourceIP: string
  sourcePort: string
  process?: string         // process basename
  chain: string            // last hop in chains[]
  rule: string             // matched rule
  upload: number           // bytes
  download: number         // bytes
  start: string            // ISO timestamp
}

export interface ActiveConnectionsSnapshot {
  uploadTotal: number
  downloadTotal: number
  count: number
  connections: ActiveConnection[]
  fetchedAt: number
}

export interface ConnectionCloseRequest {
  id: string
}

export type VpnGetConnectionsResult = IpcResult<ActiveConnectionsSnapshot | null>
export type VpnCloseConnectionResult = IpcResult<void>

// ─── Balancer ─────────────────────────────────────────────────────────────────

export type BalancerMode = 'latency' | 'stability' | 'balanced' | 'manual'

export interface NodeScore {
  name: string
  latencyMs: number | null
  jitterMs: number
  packetLoss: number     // 0.0 - 1.0
  stabilityScore: number // 0-100
  compositeScore: number // 0-100
  probeCount: number
  lastProbeAt: number | null
  quarantined: boolean
}

export interface BalancerState {
  enabled: boolean
  mode: BalancerMode
  currentBest: string | null
  lastRebalanceAt: number | null
  probeIntervalMs: number
  nodes: NodeScore[]
}

export type BalancerGetStateResult = IpcResult<BalancerState>
export type BalancerSetEnabledResult = IpcResult<void>
export type BalancerSetModeResult = IpcResult<void>
export type BalancerProbeAllResult = IpcResult<void>

export interface BalancerSetEnabledPayload {
  enabled: boolean
}

export interface BalancerSetModePayload {
  mode: BalancerMode
}

// ─── DNS ─────────────────────────────────────────────────────────────────────

// DNS config types are now the canonical definitions in @slave-vpn/core
// (P0.2b/P0.3). Re-exported here so existing app imports keep working unchanged.
export type {
  DnsPresetName,
  DnsStrategyName,
  DnsResolverKind,
  DnsRuleMatchKind,
  CustomDnsResolver,
  CustomDnsRule,
  DnsProfileConfig,
  DnsStrategyInfo,
  DnsPresetInfo,
} from '@slave-vpn/core'
import type {
  DnsPresetName,
  DnsStrategyName,
  DnsProfileConfig,
  DnsStrategyInfo,
  DnsPresetInfo,
} from '@slave-vpn/core'

export type DnsGetProfileResult = IpcResult<DnsProfileConfig>
export type DnsSetProfileResult = IpcResult<void>
export type DnsGetPresetsResult = IpcResult<DnsPresetInfo[]>
export type DnsGetStrategiesResult = IpcResult<DnsStrategyInfo[]>

export interface DnsSetProfilePayload {
  profile: DnsProfileConfig
}

export interface DnsLeakResolver {
  ip: string | null
  asn: string | null
  isp: string | null
  country: string | null
}

export interface DnsLeakReport {
  publicIp: string | null
  publicCountry: string | null
  publicColo: string | null
  resolvers: DnsLeakResolver[]
  expectedResolverHosts: string[]
  leaked: boolean
  warning: string | null
  testedAt: number
  durationMs: number
}

export type DnsLeakTestResult = IpcResult<DnsLeakReport>

// ─── Rules ────────────────────────────────────────────────────────────────────

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
  priority: number          // 0-9999; lower = higher priority
  ruleCount?: number
  lastUpdatedAt?: number
  lastError?: string
  category?: string         // 'russia-bypass' | 'streaming' | 'ai' | 'gaming' | 'privacy' | 'work' | 'custom'
  isPreset?: boolean        // built-in preset, cannot be deleted
}

export interface RuleProviderAddPayload {
  name: string
  url: string
  type: RuleProviderType
  action: RuleProviderAction
  category?: string
}

export interface RuleProviderUpdatePayload {
  id: string
  enabled?: boolean
  action?: RuleProviderAction
  priority?: number
}

export interface RuleProviderRemovePayload {
  id: string
}

export interface RuleProviderReorderPayload {
  ids: string[]  // ordered list of all provider IDs
}

export type RulesListResult = IpcResult<RuleProvider[]>
export type RulesAddResult = IpcResult<RuleProvider>
export type RulesRemoveResult = IpcResult<void>
export type RulesUpdateResult = IpcResult<RuleProvider>
export type RulesReloadResult = IpcResult<void>
export type RulesReorderResult = IpcResult<void>

// ─── Profiles (quick-switch saved combos) ────────────────────────────────────

export interface AppProfileSnapshot {
  // What this profile applies when activated. All fields optional —
  // unset fields keep the current setting.
  subscriptionId?: string         // null = don't change subscription
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

export interface ProfileCreateInput {
  name: string
  description?: string
}

export interface ProfileApplyPayload {
  id: string
  // If true, profile applies even when VPN is connected and triggers hot reload.
  hotReload?: boolean
}

export type ProfilesListResult = IpcResult<{ profiles: AppProfile[]; activeProfileId: string | null }>
export type ProfilesSaveResult = IpcResult<AppProfile>
export type ProfilesRemoveResult = IpcResult<void>
export type ProfilesApplyResult = IpcResult<AppProfile>

// ─── Geo auto-updater (J.3) ──────────────────────────────────────────────────

export interface GeoUpdateRecord {
  id: string
  label: string
  filename: string
  bytes: number
  sha256: string
  updatedAt: number
}

export interface GeoSourceInfo {
  id: string
  label: string
  url: string
  filename: string
  category: 'geo-db' | 'domain-list'
}

export interface GeoUpdaterState {
  records: GeoUpdateRecord[]
  lastFullUpdateAt: number | null
  inProgress: boolean
  intervalHours: number
}

export interface GeoUpdateOutcome {
  id: string
  status: 'ok' | 'skipped' | 'error'
  bytes?: number
  sha256?: string
  error?: string
}

export interface GeoUpdateOnePayload {
  id: string
}

export type GeoGetStateResult = IpcResult<GeoUpdaterState>
export type GeoUpdateAllResult = IpcResult<GeoUpdateOutcome[]>
export type GeoUpdateOneResult = IpcResult<GeoUpdateOutcome>
export type GeoListSourcesResult = IpcResult<GeoSourceInfo[]>

// ─── Subscriptions (multi-source) ─────────────────────────────────────────────
// Replaces the single-source ConfigSourceMeta paradigm with a collection of
// SubscriptionEntry items. Existing ConfigSourceMeta API stays for back-compat.

export type SubscriptionAutoUpdate = 0 | 15 | 60 | 360 | 1440  // minutes; 0 = off

export interface SubscriptionEntry {
  id: string
  name: string
  type: ConfigSourceType
  enabled: boolean
  autoUpdateMinutes: SubscriptionAutoUpdate
  addedAt: number
  lastFetchedAt: number | null
  lastError: string | null
  nodeCount: number | null
  urlDomain?: string
  proxyProtocol?: string
}

export interface SubscriptionAddPayload {
  name?: string
  type: ConfigSourceType
  input: string
  autoUpdateMinutes?: SubscriptionAutoUpdate
}

export interface SubscriptionUpdatePayload {
  id: string
  name?: string
  enabled?: boolean
  autoUpdateMinutes?: SubscriptionAutoUpdate
}

export interface SubscriptionRemovePayload {
  id: string
}

export interface SubscriptionRefreshPayload {
  id: string
}

export interface ClipboardDetectResult {
  found: boolean
  scheme?: string                // 'vless' | 'vmess' | ...
  preview?: NodePreview          // single-proxy parse preview
  input?: string                 // raw URI to forward to add()
}

export type SubscriptionsListResult = IpcResult<SubscriptionEntry[]>
export type SubscriptionsAddResult = IpcResult<SubscriptionEntry>
export type SubscriptionsRemoveResult = IpcResult<void>
export type SubscriptionsUpdateResult = IpcResult<SubscriptionEntry>
export type SubscriptionsRefreshResult = IpcResult<SubscriptionEntry>
export type SubscriptionsRefreshAllResult = IpcResult<SubscriptionEntry[]>
export type SubscriptionsDetectClipboardResult = IpcResult<ClipboardDetectResult>

// ─── Routing Scenarios ────────────────────────────────────────────────────────

export interface RoutingScenarioInfo {
  id: string
  name: string
  description: string
  category: string
  icon: string
  defaultEnabled: boolean
  composable: boolean
  ruleCount: number
  enabled: boolean
}

export interface RoutingSetEnabledScenariosPayload {
  scenarioIds: string[]
}

export type RoutingListScenariosResult = IpcResult<RoutingScenarioInfo[]>
export type RoutingSetEnabledScenariosResult = IpcResult<RoutingScenarioInfo[]>

// ─── Split Tunnel ─────────────────────────────────────────────────────────────

export interface RunningProcess {
  name: string
  path: string
  pid: number
  description?: string
}

export interface SplitSetProcessListPayload {
  processList: string[]  // process names e.g. ["chrome.exe", "firefox.exe"]
}

export type SplitGetProcessesResult = IpcResult<RunningProcess[]>
export type SplitSetProcessListResult = IpcResult<void>
export type SplitGetProcessListResult = IpcResult<string[]>

// Split tunnel mode (per-app on Android; the splitProcessList carries the
// package names there). off = all tunnels; include = only listed; exclude = all
// except listed.
export type SplitTunnelMode = 'off' | 'include' | 'exclude'

// Android per-app split tunnel: an installed app the user can route in/out.
export interface SplitAppInfo {
  packageName: string
  label: string
  system: boolean
}
export type SplitListAppsResult = IpcResult<SplitAppInfo[]>

// ─── Feature Flags ────────────────────────────────────────────────────────────
// App-level feature flags — separate from provider capabilities.
// Provider capabilities gate business logic; feature flags gate app behavior.

export type AppFeatureFlag =
  | 'devMode'          // Exposes dev-only UI panels
  | 'diagnosticsExport'  // Export diagnostics bundle button
  | 'advancedRouting'  // Advanced routing rule editor (future)
  | 'splitTunneling'   // Split tunnel process selection (future)
  | 'killSwitch'       // Kill switch toggle

// ─── Bridge type (window.slaveVPN) ───────────────────────────────────────────

export interface SlaveVPNBridge {
  auth: {
    loginEmail: (payload: LoginEmailPayload) => Promise<AuthLoginResult>
    loginTelegram: (payload: LoginTelegramPayload) => Promise<AuthLoginResult>
    logout: () => Promise<AuthLogoutResult>
    getMe: () => Promise<AuthMeResult>
    refresh: () => Promise<AuthLoginResult>
  }
  cabinet: {
    getAuthState: () => Promise<CabinetAuthStateResult>
    requestDeepLink: () => Promise<CabinetRequestDeepLinkResult>
    pollDeepLink: (payload: CabinetPollPayload) => Promise<CabinetPollDeepLinkResult>
    loginEmail: (payload: CabinetLoginEmailPayload) => Promise<CabinetLoginEmailResult>
    getMe: () => Promise<CabinetGetMeResult>
    getSubscription: () => Promise<CabinetGetSubscriptionResult>
    // Auto-import the cabinet's subscription URL as the active config source.
    // The URL never crosses to the renderer — only a boolean outcome.
    importSubscription: () => Promise<CabinetImportSubscriptionResult>
    logout: () => Promise<CabinetLogoutResult>
  }
  vpn: {
    connect: () => Promise<VpnConnectResult>
    disconnect: () => Promise<VpnDisconnectResult>
    getStatus: () => Promise<VpnGetStatusResult>
    setMode: (payload: VpnSetModePayload) => Promise<IpcResult<void>>
    getConnectivity: () => Promise<VpnGetConnectivityResult>
    setProxy: (payload: VpnSetProxyPayload) => Promise<VpnSetProxyResult>
    getProxyList: () => Promise<VpnGetProxyListResult>
    getConnections: () => Promise<VpnGetConnectionsResult>
    closeConnection: (payload: ConnectionCloseRequest) => Promise<VpnCloseConnectionResult>
    getBalancerState: () => Promise<BalancerGetStateResult>
    setBalancerEnabled: (payload: BalancerSetEnabledPayload) => Promise<BalancerSetEnabledResult>
    setBalancerMode: (payload: BalancerSetModePayload) => Promise<BalancerSetModeResult>
    probeAll: () => Promise<BalancerProbeAllResult>
  }
  subscription: {
    get: () => Promise<SubscriptionGetResult>
    refresh: () => Promise<SubscriptionGetResult>
    getDevices: () => Promise<SubscriptionGetDevicesResult>
    removeDevice: (payload: RemoveDevicePayload) => Promise<SubscriptionRemoveDeviceResult>
  }
  settings: {
    get: () => Promise<SettingsGetResult>
    set: (settings: Partial<AppSettings>) => Promise<SettingsSetResult>
  }
  diagnostics: {
    collect: () => Promise<DiagnosticsCollectResult>
    exportLogs: () => Promise<DiagnosticsExportLogsResult>
    getLogs: () => Promise<DiagnosticsGetLogsResult>
    getStartup: () => Promise<DiagnosticsGetStartupResult>
    selfTest: () => Promise<DiagnosticsSelfTestResult>
  }
  provider: {
    getManifest: () => Promise<ProviderGetManifestResult>
    getCapabilities: () => Promise<ProviderGetCapabilitiesResult>
  }
  configSource: {
    getMeta: () => Promise<ConfigSourceGetMetaResult>
    set: (payload: ConfigSourceSetPayload) => Promise<ConfigSourceSetResult>
    validate: (payload: ConfigSourceValidatePayload) => Promise<ConfigSourceValidateResultEnvelope>
    clear: () => Promise<ConfigSourceClearResult>
  }
  servers: {
    list: () => Promise<ServersListResult>
    probe: () => Promise<ServersProbeResult>
  }
  safeMode: {
    getStatus: () => Promise<SafeModeGetStatusResult>
    reset: () => Promise<SafeModeResetResult>
  }
  update: {
    check: () => Promise<UpdateCheckResult>
    // Fetches the GitHub Releases JSON from the MAIN process (renderer CSP
    // `connect-src 'none'` blocks api.github.com from the renderer). Returns the
    // raw release array, or [] on any failure. Never throws.
    fetchReleases: () => Promise<unknown[]>
    download: () => Promise<UpdateDownloadResult>
    install: () => Promise<UpdateInstallResult>
    getStatus: () => Promise<UpdateGetStatusResult>
    setChannel: (payload: UpdateSetChannelPayload) => Promise<UpdateSetChannelResult>
  }
  runtime: {
    restart: () => Promise<RuntimeRestartResult>
  }
  cache: {
    clear: () => Promise<CacheClearResult>
  }
  dns: {
    getProfile: () => Promise<DnsGetProfileResult>
    setProfile: (payload: DnsSetProfilePayload) => Promise<DnsSetProfileResult>
    getPresets: () => Promise<DnsGetPresetsResult>
    getStrategies: () => Promise<DnsGetStrategiesResult>
    leakTest: () => Promise<DnsLeakTestResult>
  }
  rules: {
    list: () => Promise<RulesListResult>
    add: (payload: RuleProviderAddPayload) => Promise<RulesAddResult>
    remove: (payload: RuleProviderRemovePayload) => Promise<RulesRemoveResult>
    update: (payload: RuleProviderUpdatePayload) => Promise<RulesUpdateResult>
    reorder: (payload: RuleProviderReorderPayload) => Promise<RulesReorderResult>
    reload: () => Promise<RulesReloadResult>
  }
  split: {
    getProcesses: () => Promise<SplitGetProcessesResult>
    getProcessList: () => Promise<SplitGetProcessListResult>
    setProcessList: (payload: SplitSetProcessListPayload) => Promise<SplitSetProcessListResult>
    // Android per-app VPN — list installed apps. Optional: desktop split is
    // process-based and doesn't implement it.
    listApps?: () => Promise<SplitListAppsResult>
  }
  routing: {
    listScenarios: () => Promise<RoutingListScenariosResult>
    setEnabledScenarios: (payload: RoutingSetEnabledScenariosPayload) => Promise<RoutingSetEnabledScenariosResult>
  }
  subscriptions: {
    list: () => Promise<SubscriptionsListResult>
    add: (payload: SubscriptionAddPayload) => Promise<SubscriptionsAddResult>
    remove: (payload: SubscriptionRemovePayload) => Promise<SubscriptionsRemoveResult>
    update: (payload: SubscriptionUpdatePayload) => Promise<SubscriptionsUpdateResult>
    refresh: (payload: SubscriptionRefreshPayload) => Promise<SubscriptionsRefreshResult>
    refreshAll: () => Promise<SubscriptionsRefreshAllResult>
    detectClipboard: () => Promise<SubscriptionsDetectClipboardResult>
  }
  profiles: {
    list: () => Promise<ProfilesListResult>
    saveCurrent: (payload: ProfileCreateInput) => Promise<ProfilesSaveResult>
    remove: (payload: { id: string }) => Promise<ProfilesRemoveResult>
    apply: (payload: ProfileApplyPayload) => Promise<ProfilesApplyResult>
  }
  geo: {
    getState: () => Promise<GeoGetStateResult>
    updateAll: () => Promise<GeoUpdateAllResult>
    updateOne: (payload: GeoUpdateOnePayload) => Promise<GeoUpdateOneResult>
    listSources: () => Promise<GeoListSourcesResult>
  }
  controls: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    close: () => Promise<void>
  }
  events: {
    onVpnStatus: (callback: (status: VPNStatus) => void) => () => void
    onVpnTraffic: (callback: (stats: TrafficStats) => void) => () => void
    onVpnError: (callback: (error: { code: string; message: string }) => void) => () => void
    onVpnHealth: (callback: (health: VpnHealthPayload) => void) => () => void
    onRuntimeEvent: (callback: (event: RuntimeEvent) => void) => () => void
    onSubscriptionUpdated: (callback: (sub: Subscription) => void) => () => void
    onAuthExpired: (callback: () => void) => () => void
    onUpdateAvailable: (callback: (payload: UpdateAvailablePayload) => void) => () => void
    onUpdateDownloaded: (callback: (payload: UpdateAvailablePayload) => void) => () => void
    onUpdateProgress: (callback: (payload: UpdateProgressPayload) => void) => () => void
    onNotification: (callback: (payload: NotificationPayload) => void) => () => void
    onServerLatency: (callback: (payload: ServerLatencyPayload) => void) => () => void
    onBalancerState: (callback: (state: BalancerState) => void) => () => void
    onProxyChanged: (callback: (proxyName: string) => void) => () => void
    onSubscriptionsChanged: (callback: (entries: SubscriptionEntry[]) => void) => () => void
    onProfilesChanged: (callback: (state: { profiles: AppProfile[]; activeProfileId: string | null }) => void) => () => void
    onGeoUpdaterState: (callback: (state: GeoUpdaterState) => void) => () => void
  }
}
