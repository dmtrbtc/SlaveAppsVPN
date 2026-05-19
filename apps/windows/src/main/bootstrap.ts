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
  const engineConfig = createWindowsEngineConfig(userDataPath, apiSecret)

  const selectedEngine = settings.get('selectedEngine') ?? 'mihomo'
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

  log.info({ safeMode: getSafeModeManager().isSafeMode() }, 'Bootstrap complete')
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
