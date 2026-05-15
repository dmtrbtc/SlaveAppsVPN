import crypto from 'crypto'
import { app } from 'electron'
import { openDatabase, CacheManager, SubscriptionRepository, UserRepository } from '@slave-vpn/state-sync'
import { RuntimeManager } from '@slave-vpn/runtime'
import { RemnawaveBedolagaProvider } from '@slave-vpn/provider-remnawave'
import { ElectronTokenStorage } from './services/impl/ElectronTokenStorage'
import { AuthServiceImpl } from './services/impl/AuthServiceImpl'
import { SubscriptionServiceImpl } from './services/impl/SubscriptionServiceImpl'
import { RuntimeServiceImpl } from './services/impl/RuntimeServiceImpl'
import { createWindowsEngineConfig } from './runtime/WindowsMihomoEngine'
import { getSettingsStore } from './services/SettingsStore'
import { services } from './ipc/registry'
import { sendToRenderer } from './window'
import { IpcChannel } from '../shared/ipc/channels'
import { getLogger } from './logger'

let subscriptionRefreshTimer: NodeJS.Timeout | null = null
let runtimeManager: RuntimeManager | null = null
let runtimeService: RuntimeServiceImpl | null = null

export async function bootstrap(): Promise<void> {
  const log = getLogger()
  const userDataPath = app.getPath('userData')
  const settings = getSettingsStore()

  log.info('Bootstrapping services...')

  // ─── Database ──────────────────────────────────────────────────────────────
  const db = openDatabase(userDataPath)
  const cacheManager = new CacheManager(db)
  const subscriptionRepo = new SubscriptionRepository(cacheManager)
  const userRepo = new UserRepository(cacheManager)

  log.debug('Database initialized')

  // ─── Token Storage ─────────────────────────────────────────────────────────
  const tokenStorage = new ElectronTokenStorage()

  // ─── Provider (Remnawave/Bedolaga) ─────────────────────────────────────────
  const provider = new RemnawaveBedolagaProvider({
    apiBaseUrl: settings.get('apiBaseUrl'),
    tokenStorage,
    onSessionExpired: () => {
      log.warn('Session expired — notifying renderer')
      sendToRenderer(IpcChannel.EVENT_AUTH_EXPIRED)
    },
  })

  log.debug('Provider initialized: remnawave-bedolaga')

  // ─── Application Services ─────────────────────────────────────────────────
  const authService = new AuthServiceImpl(provider.auth)
  const subscriptionService = new SubscriptionServiceImpl(provider.subscription, subscriptionRepo)

  // ─── Runtime (VPN Engine) ─────────────────────────────────────────────────
  const apiSecret = crypto.randomBytes(16).toString('hex')
  const engineConfig = createWindowsEngineConfig(userDataPath, apiSecret)

  runtimeManager = new RuntimeManager()
  await runtimeManager.initialize('mihomo', engineConfig)
  log.debug('RuntimeManager initialized')

  runtimeService = new RuntimeServiceImpl({
    manager: runtimeManager,
    configSource: provider.getConfigSource(),
    getSettings: () => settings.getAll(),
  })

  // ─── Register into IPC ServiceRegistry ────────────────────────────────────
  services.register('auth', () => authService)
  services.register('subscription', () => subscriptionService)
  services.register('runtime', () => runtimeService!)
  services.register('userRepo', () => userRepo)
  services.register('provider', () => provider)

  log.info('Services registered: auth, subscription, runtime')

  // ─── Warm up session if tokens exist ──────────────────────────────────────
  if (await tokenStorage.hasTokens()) {
    log.debug('Existing tokens found — pre-warming subscription cache')
    subscriptionService.refresh().catch((err: unknown) => {
      log.warn({ err }, 'Failed to pre-warm subscription cache on startup')
    })
  }

  // ─── Periodic subscription refresh ────────────────────────────────────────
  subscriptionRefreshTimer = subscriptionService.schedulePeriodicRefresh()

  log.info('Bootstrap complete')
}

export async function shutdownBootstrap(): Promise<void> {
  if (subscriptionRefreshTimer) {
    clearInterval(subscriptionRefreshTimer)
    subscriptionRefreshTimer = null
  }
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
