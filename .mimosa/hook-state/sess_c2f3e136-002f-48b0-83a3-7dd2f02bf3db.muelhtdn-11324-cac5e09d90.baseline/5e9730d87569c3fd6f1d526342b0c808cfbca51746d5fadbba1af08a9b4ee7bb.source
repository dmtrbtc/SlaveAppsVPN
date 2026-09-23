import type { NetworkAdapter } from '../adapters/NetworkAdapter.js'
import type { StorageAdapter } from '../adapters/StorageAdapter.js'
import {
  CabinetError,
  type CabinetDeepLink,
  type CabinetDevice,
  type CabinetDeviceList,
  type CabinetPollResult,
  type CabinetRenewalOption,
  type CabinetSubscription,
  type CabinetSubscriptionStatus,
  type CabinetTokens,
  type CabinetTransaction,
  type CabinetTransactionPage,
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
    // The bot's /start handler matches `webauth_<token>` ONLY (verified in
    // bedolaga bot start.py + the cabinet frontend's TelegramLoginButton); a
    // bare token is treated as a campaign code and never confirms the login.
    const startParam = `webauth_${d.token}`
    return {
      token: d.token,
      botUsername,
      expiresIn: d.expires_in,
      startParam,
      tgLink: `https://t.me/${botUsername}?start=${encodeURIComponent(startParam)}`,
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

  /**
   * Register a brand-new account (no Telegram needed). Returns whether the
   * server requires email verification before the account can be used. When it
   * doesn't (this deployment), the caller can immediately loginEmail().
   */
  async registerStandalone(email: string, password: string, firstName?: string): Promise<{ requiresVerification: boolean }> {
    const res = await this.post('/cabinet/auth/email/register/standalone', {
      email,
      password,
      language: 'ru',
      ...(firstName ? { first_name: firstName } : {}),
    })
    if (res.status >= 400 && res.status < 500) {
      // Surface the server's reason: «email занят», «Disposable email…», слабый пароль.
      let detail = ''
      try { detail = String((JSON.parse(res.body) as { detail?: unknown }).detail ?? '') } catch { /* */ }
      throw new CabinetError('INVALID_CREDENTIALS', detail || 'Не удалось зарегистрировать (проверьте email и пароль)')
    }
    if (res.status < 200 || res.status >= 300) {
      throw new CabinetError('SERVER', `register failed (HTTP ${res.status})`)
    }
    const d = this.parse<{ requires_verification?: boolean }>(res.body)
    return { requiresVerification: !!d.requires_verification }
  }

  /** Verify an email via the token from the verification email link → logs in. */
  async verifyEmail(token: string): Promise<CabinetUser> {
    const res = await this.post('/cabinet/auth/email/verify', { token })
    if (res.status < 200 || res.status >= 300) {
      throw new CabinetError('SERVER', `verify failed (HTTP ${res.status})`)
    }
    return this.consumeAuthResponse(res.body)
  }

  /** Request a password-reset email. Always succeeds (no account enumeration). */
  async passwordForgot(email: string): Promise<void> {
    await this.post('/cabinet/auth/password/forgot', { email })
  }

  /** Reset the password using the token from the reset email link. */
  async passwordReset(token: string, password: string): Promise<void> {
    const res = await this.post('/cabinet/auth/password/reset', { token, password })
    if (res.status < 200 || res.status >= 300) {
      let detail = ''
      try { detail = String((JSON.parse(res.body) as { detail?: unknown }).detail ?? '') } catch { /* */ }
      throw new CabinetError('SERVER', detail || `reset failed (HTTP ${res.status})`)
    }
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

  // ── Account extras (balance / devices / renewal) ─────────────────────────

  async getBalance(): Promise<{ balanceKopeks: number; balanceRubles: number }> {
    const res = await this.authed('GET', '/cabinet/balance')
    const d = this.parse<{ balance_kopeks: number; balance_rubles: number }>(res.body)
    return { balanceKopeks: Number(d.balance_kopeks ?? 0), balanceRubles: Number(d.balance_rubles ?? 0) }
  }

  async getTransactions(page = 1, perPage = 20): Promise<CabinetTransactionPage> {
    const res = await this.authed('GET', `/cabinet/balance/transactions?page=${page}&per_page=${perPage}`)
    const d = this.parse<{ items: Record<string, unknown>[]; total: number; page: number; pages: number }>(res.body)
    return {
      items: (d.items ?? []).map((t): CabinetTransaction => ({
        id: Number(t.id),
        type: (t.type as string) ?? '',
        amountKopeks: Number(t.amount_kopeks ?? 0),
        amountRubles: Number(t.amount_rubles ?? 0),
        description: (t.description as string) ?? null,
        paymentMethod: (t.payment_method as string) ?? null,
        isCompleted: !!t.is_completed,
        createdAt: (t.created_at as string) ?? '',
      })),
      total: Number(d.total ?? 0),
      page: Number(d.page ?? 1),
      pages: Number(d.pages ?? 1),
    }
  }

  async getDevices(): Promise<CabinetDeviceList> {
    const res = await this.authed('GET', '/cabinet/subscription/devices')
    const d = this.parse<{ devices?: Record<string, unknown>[]; total?: number; device_limit?: number }>(res.body)
    return {
      devices: (d.devices ?? []).map((x): CabinetDevice => ({
        hwid: String(x.hwid ?? ''),
        platform: (x.platform as string) ?? 'Unknown',
        deviceModel: (x.device_model as string) ?? 'Unknown',
        localName: (x.local_name as string) ?? null,
      })),
      total: Number(d.total ?? 0),
      deviceLimit: Number(d.device_limit ?? 0),
    }
  }

  async removeDevice(hwid: string): Promise<void> {
    await this.authed('DELETE', `/cabinet/subscription/devices/${encodeURIComponent(hwid)}`)
  }

  async getRenewalOptions(): Promise<CabinetRenewalOption[]> {
    const res = await this.authed('GET', '/cabinet/subscription/renewal-options')
    const arr = this.parse<Record<string, unknown>[]>(res.body)
    return (Array.isArray(arr) ? arr : []).map((x): CabinetRenewalOption => ({
      periodDays: Number(x.period_days ?? 0),
      priceKopeks: Number(x.price_kopeks ?? 0),
      priceRubles: Number(x.price_rubles ?? 0),
      discountPercent: Number(x.discount_percent ?? 0),
      originalPriceKopeks: x.original_price_kopeks == null ? null : Number(x.original_price_kopeks),
    }))
  }

  /** Renew from the cabinet balance. Throws SERVER with the API detail (e.g. insufficient funds). */
  async renewSubscription(periodDays: number): Promise<void> {
    await this.authed('POST', '/cabinet/subscription/renew', { period_days: periodDays })
  }

  async setAutopay(enabled: boolean, daysBefore?: number): Promise<void> {
    await this.authed('PATCH', '/cabinet/subscription/autopay', {
      enabled,
      ...(daysBefore != null ? { days_before: daysBefore } : {}),
    })
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

  /** Authenticated request with bearer + single transparent refresh-on-401. */
  private async authed(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown) {
    let tokens = await this.getTokens()
    if (!tokens?.accessToken) throw new CabinetError('NOT_AUTHENTICATED', 'Нет активной сессии')

    let res = await this.request(method, path, body, tokens.accessToken)
    if (res.status === 401) {
      tokens = await this.refresh()
      res = await this.request(method, path, body, tokens.accessToken)
    }
    if (res.status === 401 || res.status === 403) {
      await this.clearTokens()
      throw new CabinetError('AUTH_EXPIRED', 'Сессия истекла, войдите снова')
    }
    if (res.status < 200 || res.status >= 300) {
      // Surface the API's human-readable detail when present (e.g. «Недостаточно средств»).
      let detail = ''
      try { detail = String((JSON.parse(res.body) as { detail?: unknown }).detail ?? '') } catch { /* not JSON */ }
      throw new CabinetError('SERVER', detail || `${method} ${path} failed (HTTP ${res.status})`)
    }
    return res
  }

  private async authedGet(path: string) {
    return this.authed('GET', path)
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

  private async request(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown, accessToken?: string) {
    return this.net.fetch(this.base + path, {
      method,
      headers: this.headers(accessToken),
      ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }),
      timeoutMs: 15_000,
    })
  }

  private async post(path: string, body: unknown, accessToken?: string) {
    return this.request('POST', path, body, accessToken)
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
