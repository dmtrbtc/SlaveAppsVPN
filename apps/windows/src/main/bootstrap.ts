import crypto from 'crypto'
import { app } from 'electron'
import { openDatabase, CacheManager, SubscriptionRepository, UserRepository } from '@slave-vpn/state-sync'
import { RuntimeManager } from '@slave-vpn/runtime'
import { RemnawaveBedolagaProvider } from '@slave-vpn/provider-remnawave'
import { ElectronTokenStorage } from './services/impl/ElectronTokenStorage'
import { AuthServiceImpl } from './services/impl/AuthServiceImpl'
import { SubscriptionServiceImpl } from './services/impl/SubscriptionServiceImpl'
import { RuntimeServiceImpl } from './services/impl/RuntimeServiceImpl'
import { getConfigSourceService } from './services/impl/ConfigSourceService'
import { createWindowsEngineConfig } from './runtime/WindowsMihomoEngine'
import { getSettingsStore } from './services/SettingsStore'
import { RecoveryCoordinator } from './services/RecoveryCoordinator'
import { getSafeModeManager } from './services/SafeModeManager'
import { getNodeHealthManager } from './services/NodeHealthManager'
import { getSubscriptionStore } from './services/SubscriptionStore'
import { getSubscriptionScheduler } from './services/SubscriptionScheduler'
import { getNodeBalancerService } from './services/NodeBalancerService'
import { getProfileStore } from './services/ProfileStore'
import { setTrayActions, updateTrayStatus, updateTrayMode, updateTraySelectedProxy, updateTrayProxyList, updateTrayBalancer, updateTrayProfiles } from './tray'
import { VPN } from '@slave-vpn/shared'
import { services } from './ipc/registry'
import { sendToRenderer } from './window'
import { IpcChannel } from '../shared/ipc/channels'
import { getLogger } from './logger'

let subscriptionRefreshTimer: NodeJS.Timeout | null = null
let runtimeManager: RuntimeManager | null = null
let runtimeService: RuntimeServiceImpl | null = null
let recoveryCoordinator: RecoveryCoordinator | null = null

const BOOTSTRAP_TIMEOUT_MS = 30_000

export async function bootstrap(safeModeFlag = false): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('Bootstrap timed out after 30s')),
      BOOTSTRAP_TIMEOUT_MS
    )
  })
  try {
    await Promise.race([_bootstrap(safeModeFlag), timeout])
  } finally {
    clearTimeout(timer)
  }
}

async function _bootstrap(safeModeFlag: boolean): Promise<void> {
  const log = getLogger()
  const userDataPath = app.getPath('userData')
  const settings = getSettingsStore()

  if (safeModeFlag) {
    log.warn('Bootstrap running in --safe-mode: skipping provider and runtime init')
    // IPC handlers already guard with services.has('runtime') / services.has('auth')
    // and return NOT_INITIALIZED error codes when services are absent.
    // Safe mode intentionally leaves them unregistered — UI shows degraded state.
    services.register('auth', () => ({
      loginEmail: async (): Promise<never> => { throw new Error('Safe mode: provider disabled') },
      loginTelegram: async (): Promise<never> => { throw new Error('Safe mode: provider disabled') },
      logout: async (): Promise<void> => { /* no-op */ },
      getMe: async (): Promise<never> => { throw new Error('Safe mode: provider disabled') },
      refresh: async (): Promise<never> => { throw new Error('Safe mode: provider disabled') },
    }))
    getSafeModeManager().scheduleHealthyMark()
    log.info({ safeMode: true }, 'Safe mode bootstrap complete')
    return
  }

  log.info('Bootstrapping services...')

  // ─── Database ──────────────────────────────────────────────────────────────
  const db = openDatabase(userDataPath)
  const cacheManager = new CacheManager(db)
  const subscriptionRepo = new SubscriptionRepository(cacheManager)
  const userRepo = new UserRepository(cacheManager)

  log.debug('Database initialized')

  // ─── Token Storage ─────────────────────────────────────────────────────────
  const tokenStorage = new ElectronTokenStorage()

  // ─── Runtime (VPN Engine) ─────────────────────────────────────────────────
  const apiSecret = crypto.randomBytes(16).toString('hex')
  const selectedEngine = settings.get('selectedEngine') ?? 'mihomo'
  const engineConfig = createWindowsEngineConfig(userDataPath, apiSecret, selectedEngine)

  runtimeManager = new RuntimeManager()
  await runtimeManager.initialize(selectedEngine, engineConfig)
  log.debug({ engine: selectedEngine }, 'RuntimeManager initialized')

  // ─── Determine config source ───────────────────────────────────────────────
  // Priority:
  //   1. Non-provider config source (subscription-url, single-proxy, remnawave-key)
  //   2. Provider (Remnawave/Bedolaga) if auth tokens exist
  //   3. No config source — renderer will route to onboarding

  const configSourceService = getConfigSourceService()
  const storedMeta = configSourceService.getMeta()
  const hasProviderTokens = await tokenStorage.hasTokens()

  let configSource = storedMeta ? configSourceService.createConfigSource() : null
  let hasProvider = false

  if (configSource) {
    log.info({ type: storedMeta?.type }, 'Using stored config source')
  } else if (hasProviderTokens) {
    log.info('No stored config source — initializing provider with existing tokens')

    const provider = new RemnawaveBedolagaProvider({
      apiBaseUrl: settings.get('apiBaseUrl'),
      tokenStorage,
      onSessionExpired: () => {
        log.warn('Session expired — notifying renderer')
        sendToRenderer(IpcChannel.EVENT_AUTH_EXPIRED)
      },
    })

    const authService = new AuthServiceImpl(provider.auth)
    const subscriptionService = new SubscriptionServiceImpl(provider.subscription, subscriptionRepo)

    services.register('auth', () => authService)
    services.register('subscription', () => subscriptionService)
    services.register('provider', () => provider)

    configSource = provider.getConfigSource()
    hasProvider = true

    log.debug('Provider initialized: remnawave-bedolaga')

    // Warm up subscription cache
    subscriptionService.refresh().catch((err: unknown) => {
      log.warn({ err }, 'Failed to pre-warm subscription cache on startup')
    })

    subscriptionRefreshTimer = subscriptionService.schedulePeriodicRefresh()
  } else {
    log.info('No config source or provider tokens — awaiting onboarding')
  }

  runtimeService = new RuntimeServiceImpl({
    manager: runtimeManager,
    ...(configSource ? { configSource } : {}),
    getSettings: () => settings.getAll(),
    apiPort: VPN.MIHOMO_API_PORT,
    apiSecret,
    binaryPath: engineConfig.binaryPath,
    workingDir: engineConfig.workingDir,
  })

  recoveryCoordinator = new RecoveryCoordinator(runtimeManager)
  recoveryCoordinator.setConnectFn(() => runtimeService!.connect())

  // ─── Register into IPC ServiceRegistry ────────────────────────────────────
  services.register('runtime', () => runtimeService!)
  services.register('userRepo', () => userRepo)

  if (!hasProvider) {
    // Stub auth/subscription services so IPC handlers don't throw NOT_REGISTERED
    services.register('auth', () => ({
      loginEmail: async () => { throw new Error('No provider configured') },
      loginTelegram: async () => { throw new Error('No provider configured') },
      logout: async () => { /* no-op */ },
      getMe: async () => { throw new Error('No provider configured') },
      refresh: async () => { throw new Error('No provider configured') },
    }))
  }

  // Schedule healthy mark — after 60s uptime without crash, reset crash counter
  getSafeModeManager().scheduleHealthyMark()

  // Multi-subscription init: load store (triggers legacy migration) + start scheduler
  const subStore = getSubscriptionStore()
  const initialList = subStore.list()
  log.info({ subscriptions: initialList.length }, 'Subscription store loaded')
  getSubscriptionScheduler().start()

  // ─── Wire system tray to runtime service ──────────────────────────────────
  // After runtimeService and balancer are registered, the tray can drive them.
  wireTray(runtimeService, settings)

  log.info({ safeMode: getSafeModeManager().isSafeMode() }, 'Bootstrap complete')
}

// Wires tray menu actions and live updates to the runtime / balancer.
function wireTray(runtime: RuntimeServiceImpl, settings: ReturnType<typeof getSettingsStore>): void {
  const log = getLogger()
  const balancer = getNodeBalancerService(VPN.MIHOMO_API_PORT, settings.get('apiBaseUrl') ?? '')

  const profileStore = getProfileStore()

  setTrayActions({
    connect: () => runtime.connect(),
    disconnect: () => runtime.disconnect(),
    setMode: (mode) => runtime.setMode(mode),
    setProxy: (proxyName) => runtime.setSelectedProxy(proxyName).catch(async () => {
      // If VPN is not running, persist the selection so the next connect uses it.
      await import('./services/SettingsStore').then(({ getSettingsStore: getS }) =>
        getS().patch({ selectedProxy: proxyName }))
    }),
    setBalancerEnabled: async (enabled) => {
      await balancer.setEnabled(enabled)
      settings.patch({ balancerEnabled: enabled })
      updateTrayBalancer(enabled)
    },
    applyProfile: async (id) => {
      const profile = profileStore.getById(id)
      if (!profile) return
      const patch: Record<string, unknown> = {}
      const snap = profile.snapshot
      if (snap.enabledScenarios !== undefined) patch.enabledScenarios = snap.enabledScenarios
      if (snap.dnsPreset !== undefined)        patch.dnsPreset = snap.dnsPreset
      if (snap.dnsStrategy !== undefined)      patch.dnsStrategy = snap.dnsStrategy
      if (snap.selectedEngine !== undefined)   patch.selectedEngine = snap.selectedEngine
      if (snap.selectedProxy !== undefined)    patch.selectedProxy = snap.selectedProxy
      if (snap.vpnMode !== undefined)          patch.vpnMode = snap.vpnMode
      if (snap.balancerEnabled !== undefined)  patch.balancerEnabled = snap.balancerEnabled
      if (Object.keys(patch).length > 0) settings.patch(patch)
      profileStore.markApplied(id)
      updateTrayProfiles(profileStore.list(), profileStore.getActiveId())
      if (runtime.getState() === 'running') {
        runtime.notifySubscriptionsChanged().catch(() => undefined)
      }
    },
  })

  // Initial paint from current settings
  updateTrayMode(settings.get('vpnMode'))
  updateTraySelectedProxy(settings.get('selectedProxy'))
  updateTrayBalancer(settings.get('balancerEnabled'))

  // Subscribe to runtime state — manager exposes the engine state machine events
  if (runtimeManager) {
    runtimeManager.on('stateChanged', ({ state: engineState }) => {
      const map: Record<typeof engineState, ReturnType<typeof runtime.getStatus>['state']> = {
        idle: 'disconnected',
        starting: 'connecting',
        running: 'connected',
        stopping: 'disconnecting',
        crashed: 'reconnecting',
        reconnecting: 'reconnecting',
        error: 'error',
      }
      updateTrayStatus(map[engineState] ?? 'disconnected')
    })
  }

  // Initial proxy list load — best-effort
  runtime.getProxyList().then(list => {
    updateTrayProxyList(list.map(p => ({ name: p.name })))
  }).catch((err: unknown) => log.debug({ err }, 'Tray proxy list initial load failed'))

  // Initial profiles load
  updateTrayProfiles(profileStore.list(), profileStore.getActiveId())

  // Periodic re-sync of tray state — cheap enough to run every 5s and keeps
  // tray accurate without wiring a dedicated event bus. Reads from settings
  // (fast) and runtime status (already in memory).
  setInterval(() => {
    const s = settings.getAll()
    updateTrayMode(s.vpnMode)
    updateTraySelectedProxy(s.selectedProxy)
    updateTrayBalancer(s.balancerEnabled)
    updateTrayProfiles(profileStore.list(), profileStore.getActiveId())

    // Refresh proxy list lazily: only when status is connected
    if (runtime.getState() === 'running') {
      runtime.getProxyList().then(list => {
        updateTrayProxyList(list.map(p => ({ name: p.name })))
      }).catch(() => undefined)
    }
  }, 5_000).unref()
}

export function updateRuntimeConfigSource(): void {
  const configSourceService = getConfigSourceService()
  const source = configSourceService.createConfigSource()
  if (source && runtimeService) {
    runtimeService.setConfigSource(source)
    getLogger().info('Runtime config source updated')
  }
}

export async function clearSubscriptionCache(): Promise<void> {
  if (subscriptionRefreshTimer) {
    clearInterval(subscriptionRefreshTimer)
    subscriptionRefreshTimer = null
  }
  // The next bootstrap/refresh will repopulate from the provider
  getLogger().info('Subscription cache cleared')
}

export async function shutdownBootstrap(): Promise<void> {
  if (subscriptionRefreshTimer) {
    clearInterval(subscriptionRefreshTimer)
    subscriptionRefreshTimer = null
  }
  recoveryCoordinator?.dispose()
  recoveryCoordinator = null
  getSafeModeManager().dispose()
  getNodeHealthManager().dispose()
  if (runtimeManager) {
    await runtimeManager.dispose().catch(() => undefined)
    runtimeManager = null
  }
  runtimeService = null
}

// Trigger a VPN reconnect — used by powerMonitor resume handler.
// Only reconnects if the VPN was actively connected when the event fired.
export async function triggerReconnect(): Promise<void> {
  if (!runtimeService || !runtimeManager) return
  const state = runtimeManager.getState()
  if (state !== 'running') return
  const log = getLogger()
  log.info('triggerReconnect: forcing reconnect after sleep/wake')
  await runtimeService.disconnect()
  await runtimeService.connect()
}
