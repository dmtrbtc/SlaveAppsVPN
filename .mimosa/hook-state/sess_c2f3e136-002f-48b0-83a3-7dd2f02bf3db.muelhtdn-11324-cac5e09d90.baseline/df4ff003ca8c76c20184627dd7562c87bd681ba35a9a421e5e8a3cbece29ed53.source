import type { AxiosInstance } from 'axios'
import type { AuthTokens } from '@slave-vpn/shared'
import type { DeepLinkTokenResponse, PollDeepLinkResponse } from '../types/auth.types'
import { ApiError } from '../errors/ApiError'
import { sleep } from '@slave-vpn/shared'

const BASE = '/cabinet/auth'

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000
const DEFAULT_INITIAL_POLL_MS = 2_000
const DEFAULT_MAX_POLL_MS = 10_000
const DEFAULT_BACKOFF_MULTIPLIER = 1.5

export type TelegramAuthState =
  | { type: 'initializing' }
  | { type: 'link_ready'; link: string }
  | { type: 'polling' }
  | { type: 'confirmed'; tokens: AuthTokens }
  | { type: 'expired' }
  | { type: 'cancelled' }
  | { type: 'error'; message: string }

export interface TelegramAuthFlowOptions {
  onStateChange: (state: TelegramAuthState) => void
  timeoutMs?: number
  initialPollMs?: number
  maxPollMs?: number
  backoffMultiplier?: number
}

export class TelegramAuthFlow {
  private abortController: AbortController | null = null

  constructor(private readonly axios: AxiosInstance) {}

  async start(options: TelegramAuthFlowOptions): Promise<AuthTokens> {
    const {
      onStateChange,
      timeoutMs = DEFAULT_TIMEOUT_MS,
      initialPollMs = DEFAULT_INITIAL_POLL_MS,
      maxPollMs = DEFAULT_MAX_POLL_MS,
      backoffMultiplier = DEFAULT_BACKOFF_MULTIPLIER,
    } = options

    this.abortController = new AbortController()
    const { signal } = this.abortController

    const timeoutId = setTimeout(() => {
      this.abortController?.abort('timeout')
    }, timeoutMs)

    try {
      onStateChange({ type: 'initializing' })

      const { token, tg_link } = await this.createDeepLinkToken(signal)

      onStateChange({ type: 'link_ready', link: tg_link })

      onStateChange({ type: 'polling' })

      const tokens = await this.pollForConfirmation({
        token,
        signal,
        onStateChange,
        initialPollMs,
        maxPollMs,
        backoffMultiplier,
      })

      onStateChange({ type: 'confirmed', tokens })
      return tokens
    } catch (error) {
      if (signal.aborted) {
        const reason = signal.reason as string | undefined
        if (reason === 'cancelled') {
          onStateChange({ type: 'cancelled' })
          throw new ApiError('SESSION_EXPIRED', 'Telegram auth cancelled by user')
        }
        onStateChange({ type: 'expired' })
        throw new ApiError('SESSION_EXPIRED', 'Telegram auth timed out')
      }

      const message = error instanceof Error ? error.message : 'Unknown error'
      onStateChange({ type: 'error', message })
      throw error
    } finally {
      clearTimeout(timeoutId)
      this.abortController = null
    }
  }

  cancel(): void {
    this.abortController?.abort('cancelled')
  }

  private async createDeepLinkToken(signal: AbortSignal): Promise<DeepLinkTokenResponse> {
    const response = await this.axios.get<DeepLinkTokenResponse>(
      `${BASE}/deep-link-token`,
      { signal }
    )
    return response.data
  }

  private async pollForConfirmation(options: {
    token: string
    signal: AbortSignal
    onStateChange: (state: TelegramAuthState) => void
    initialPollMs: number
    maxPollMs: number
    backoffMultiplier: number
  }): Promise<AuthTokens> {
    const { token, signal, initialPollMs, maxPollMs, backoffMultiplier } = options

    let intervalMs = initialPollMs

    while (!signal.aborted) {
      await sleep(intervalMs)

      if (signal.aborted) break

      const result = await this.axios.get<PollDeepLinkResponse>(
        `${BASE}/poll-deep-link`,
        {
          params: { token },
          signal,
          validateStatus: (status) => status === 200 || status === 202 || status === 410,
        }
      )

      if (result.status === 200 && result.data.status === 'confirmed') {
        if (!result.data.access_token) {
          throw new ApiError('PARSE_ERROR', 'Confirmed response missing access_token')
        }
        return {
          accessToken: result.data.access_token,
          refreshToken: result.data.refresh_token ?? '',
          expiresAt: Date.now() + 60 * 60 * 1000,
        }
      }

      if (result.status === 410 || result.data.status === 'expired') {
        throw new ApiError('SESSION_EXPIRED', 'Telegram auth session expired')
      }

      intervalMs = Math.min(intervalMs * backoffMultiplier, maxPollMs)
    }

    throw new ApiError('SESSION_EXPIRED', 'Telegram auth aborted')
  }
}
