import type { NetworkAdapter } from '../adapters/NetworkAdapter.js'
import type { StorageAdapter } from '../adapters/StorageAdapter.js'
import {
  CabinetError,
  type CabinetDeepLink,
  type CabinetPollResult,
  type CabinetSubscription,
  type CabinetSubscriptionStatus,
  type CabinetTokens,
  type CabinetUser,
} from './types.js'

export const CABINET_DEFAULT_BASE_URL = 'https://cabinet.slave-apps.online/api'
const TOKENS_KEY = 'slave.cabinet.tokens.v1'

/**
 * Platform-agnostic client for the bedolaga personal cabinet. Runs unchanged in
 * the Windows main process (Node fetch) and the Android renderer (CapacitorHttp)
 * because it only depends on the NetworkAdapter (CORS/UA-safe HTTP) and the
 * StorageAdapter (token persistence).
 *
 * Endpoints + status semantics verified against the live OpenAPI:
 *   POST /cabinet/auth/deeplink/request → {token, bot_username, expires_in}
 *   POST /cabinet/auth/deeplink/poll    → 202 pending / 200 AuthResponse
 *   POST /cabinet/auth/email/login      → AuthResponse
 *   POST /cabinet/auth/refresh          → TokenResponse
 *   GET  /cabinet/auth/me               → UserResponse
 *   GET  /cabinet/subscription          → {has_subscription, subscription}
 *   GET  /cabinet/subscription/connection-link → {…subscription_url…}
 */
export class CabinetClient {
  private readonly base: string

  constructor(
    private readonly net: NetworkAdapter,
    private readonly storage: StorageAdapter,
    baseUrl: string = CABINET_DEFAULT_BASE_URL,
  ) {
    this.base = baseUrl.replace(/\/+$/, '')
  }

  // ── Token persistence ────────────────────────────────────────────────────
  async getTokens(): Promise<CabinetTokens | null> {
    return (await this.storage.get<CabinetTokens>(TOKENS_KEY)) ?? null
  }

  async isAuthenticated(): Promise<boolean> {
    const t = await this.getTokens()
    return !!t?.accessToken
  }

  private async storeTokens(t: CabinetTokens): Promise<void> {
    await this.storage.set(TOKENS_KEY, t)
  }

  private async clearTokens(): Promise<void> {
    await this.storage.remove(TOKENS_KEY)
  }

  // ── Telegram deep-link login ─────────────────────────────────────────────
  async requestDeepLink(): Promise<CabinetDeepLink> {
    const res = await this.post('/cabinet/auth/deeplink/request', {})
    if (res.status < 200 || res.status >= 300) {
      throw new CabinetError('SERVER', `deeplink/request failed (HTTP ${res.status})`)
    }
    const d = this.parse<{ token: string; bot_username: string; expires_in: number }>(res.body)
    const botUsername = d.bot_username
    return {
      token: d.token,
      botUsername,
      expiresIn: d.expires_in,
      tgLink: `https://t.me/${botUsername}?start=${encodeURIComponent(d.token)}`,
    }
  }

  /**
   * Poll a deep-link token once. 202 → still waiting; 200 → confirmed (tokens
   * stored); 4xx/410 → expired. The caller drives the loop (it owns cancel + UI).
   */
  async pollDeepLink(token: string): Promise<CabinetPollResult> {
    const res = await this.post('/cabinet/auth/deeplink/poll', { token })
    if (res.status === 202) return { status: 'pending' }
    if (res.status === 200) {
      const user = await this.consumeAuthResponse(res.body)
      return { status: 'confirmed', user }
    }
    if (res.status === 404 || res.status === 410 || res.status === 400) {
      return { status: 'expired' }
    }
    throw new CabinetError('SERVER', `deeplink/poll failed (HTTP ${res.status})`)
  }

  // ── Email login ──────────────────────────────────────────────────────────
  async loginEmail(email: string, password: string): Promise<CabinetUser> {
    const res = await this.post('/cabinet/auth/email/login', { email, password })
    if (res.status === 401 || res.status === 403 || res.status === 422) {
      throw new CabinetError('INVALID_CREDENTIALS', 'Неверный email или пароль')
    }
    if (res.status < 200 || res.status >= 300) {
      throw new CabinetError('SERVER', `email/login failed (HTTP ${res.status})`)
    }
    return this.consumeAuthResponse(res.body)
  }

  async registerEmail(email: string, password: string): Promise<void> {
    const res = await this.post('/cabinet/auth/email/register', { email, password })
    if (res.status < 200 || res.status >= 300) {
      throw new CabinetError('SERVER', `email/register failed (HTTP ${res.status})`)
    }
    // Verification happens out-of-band (email link). Caller informs the user.
  }

  // ── Authenticated reads ──────────────────────────────────────────────────
  async getMe(): Promise<CabinetUser> {
    const res = await this.authedGet('/cabinet/auth/me')
    return this.mapUser(this.parse(res.body))
  }

  async getSubscriptionStatus(): Promise<CabinetSubscriptionStatus> {
    const res = await this.authedGet('/cabinet/subscription')
    const d = this.parse<{ has_subscription: boolean; subscription: unknown }>(res.body)
    return {
      hasSubscription: !!d.has_subscription,
      subscription: d.subscription ? this.mapSubscription(d.subscription as Record<string, unknown>) : null,
    }
  }

  /**
   * Returns the raw subscription URL for auto-import. Prefers the dedicated
   * connection-link endpoint; falls back to subscription.subscription_url.
   * SENSITIVE — on Windows this stays in the main process; never log it.
   */
  async getSubscriptionUrl(): Promise<string | null> {
    try {
      const res = await this.authedGet('/cabinet/subscription/connection-link')
      const d = this.parse<Record<string, unknown>>(res.body)
      const url = (d.subscription_url ?? d.url ?? d.connection_link ?? d.link) as string | undefined
      if (typeof url === 'string' && url) return url
    } catch {
      // fall through to the subscription payload
    }
    const status = await this.getSubscriptionStatus()
    return status.subscription?.subscriptionUrl ?? null
  }

  async logout(): Promise<void> {
    try {
      const tokens = await this.getTokens()
      if (tokens?.accessToken) {
        await this.post('/cabinet/auth/logout', {}, tokens.accessToken)
      }
    } catch {
      // best-effort server logout
    }
    await this.clearTokens()
  }

  // ── Internals ────────────────────────────────────────────────────────────

  /** GET with bearer + single transparent refresh-on-401. */
  private async authedGet(path: string) {
    let tokens = await this.getTokens()
    if (!tokens?.accessToken) throw new CabinetError('NOT_AUTHENTICATED', 'Нет активной сессии')

    let res = await this.get(path, tokens.accessToken)
    if (res.status === 401) {
      tokens = await this.refresh()
      res = await this.get(path, tokens.accessToken)
    }
    if (res.status === 401 || res.status === 403) {
      await this.clearTokens()
      throw new CabinetError('AUTH_EXPIRED', 'Сессия истекла, войдите снова')
    }
    if (res.status < 200 || res.status >= 300) {
      throw new CabinetError('SERVER', `GET ${path} failed (HTTP ${res.status})`)
    }
    return res
  }

  private async refresh(): Promise<CabinetTokens> {
    const current = await this.getTokens()
    if (!current?.refreshToken) {
      await this.clearTokens()
      throw new CabinetError('AUTH_EXPIRED', 'Нет refresh-токена')
    }
    const res = await this.post('/cabinet/auth/refresh', { refresh_token: current.refreshToken })
    if (res.status < 200 || res.status >= 300) {
      await this.clearTokens()
      throw new CabinetError('AUTH_EXPIRED', 'Не удалось обновить сессию')
    }
    const d = this.parse<{ access_token: string; refresh_token?: string; expires_in?: number }>(res.body)
    const tokens = this.toTokens(d.access_token, d.refresh_token ?? current.refreshToken, d.expires_in)
    await this.storeTokens(tokens)
    return tokens
  }

  /** Parse an AuthResponse body, store its tokens, return the mapped user. */
  private async consumeAuthResponse(body: string): Promise<CabinetUser> {
    const d = this.parse<{
      access_token: string
      refresh_token: string
      expires_in?: number
      user: Record<string, unknown>
    }>(body)
    if (!d.access_token) throw new CabinetError('PARSE', 'Ответ без access_token')
    await this.storeTokens(this.toTokens(d.access_token, d.refresh_token, d.expires_in))
    return this.mapUser(d.user)
  }

  private toTokens(access: string, refresh: string, expiresInSec?: number): CabinetTokens {
    const ttl = (expiresInSec ?? 15 * 60) * 1000
    return { accessToken: access, refreshToken: refresh ?? '', expiresAt: Date.now() + ttl }
  }

  private async get(path: string, accessToken?: string) {
    return this.net.fetch(this.base + path, {
      method: 'GET',
      headers: this.headers(accessToken),
      timeoutMs: 15_000,
    })
  }

  private async post(path: string, body: unknown, accessToken?: string) {
    return this.net.fetch(this.base + path, {
      method: 'POST',
      headers: this.headers(accessToken),
      body: JSON.stringify(body ?? {}),
      timeoutMs: 15_000,
    })
  }

  private headers(accessToken?: string): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
    if (accessToken) h.Authorization = `Bearer ${accessToken}`
    return h
  }

  private parse<T>(body: string): T {
    try {
      return JSON.parse(body) as T
    } catch {
      throw new CabinetError('PARSE', 'Некорректный ответ сервера')
    }
  }

  private mapUser(d: Record<string, unknown>): CabinetUser {
    return {
      id: Number(d.id),
      telegramId: d.telegram_id == null ? null : Number(d.telegram_id),
      username: (d.username as string) ?? null,
      firstName: (d.first_name as string) ?? null,
      lastName: (d.last_name as string) ?? null,
      email: (d.email as string) ?? null,
      emailVerified: !!d.email_verified,
      balanceKopeks: Number(d.balance_kopeks ?? 0),
      balanceRubles: Number(d.balance_rubles ?? 0),
      referralCode: (d.referral_code as string) ?? null,
      language: (d.language as string) ?? 'ru',
      createdAt: (d.created_at as string) ?? '',
      authType: (d.auth_type as string) ?? '',
    }
  }

  private mapSubscription(d: Record<string, unknown>): CabinetSubscription {
    const num = (v: unknown): number => Number(v ?? 0)
    return {
      id: num(d.id),
      status: (d.status as string) ?? 'none',
      isTrial: !!d.is_trial,
      startDate: (d.start_date as string) ?? '',
      endDate: (d.end_date as string) ?? '',
      daysLeft: num(d.days_left),
      hoursLeft: num(d.hours_left),
      minutesLeft: num(d.minutes_left),
      timeLeftDisplay: (d.time_left_display as string) ?? '',
      trafficLimitGb: num(d.traffic_limit_gb),
      trafficUsedGb: num(d.traffic_used_gb),
      trafficUsedPercent: num(d.traffic_used_percent),
      deviceLimit: num(d.device_limit),
      autopayEnabled: !!d.autopay_enabled,
      isActive: !!d.is_active,
      isExpired: !!d.is_expired,
      isLimited: !!d.is_limited,
      tariffName: (d.tariff_name as string) ?? null,
      subscriptionUrl: (d.subscription_url as string) ?? null,
    }
  }
}
