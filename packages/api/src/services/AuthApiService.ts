import type { ApiClient } from '../client/ApiClient'
import type {
  ApiAuthTokens,
  ApiUser,
  LoginEmailRequest,
  LoginTelegramWidgetRequest,
  RefreshTokenRequest,
} from '../types/auth.types'
import type { AuthTokens, User } from '@slave-vpn/shared'
import { ApiError } from '../errors/ApiError'

const BASE = '/cabinet/auth'

export class AuthApiService {
  constructor(private readonly client: ApiClient) {}

  async loginEmail(email: string, password: string): Promise<AuthTokens> {
    const payload: LoginEmailRequest = { email, password }
    const response = await this.client.axios.post<ApiAuthTokens>(`${BASE}/login/email`, payload)
    return this.mapTokens(response.data)
  }

  async loginTelegramWidget(data: LoginTelegramWidgetRequest): Promise<AuthTokens> {
    const response = await this.client.axios.post<ApiAuthTokens>(`${BASE}/login/telegram`, data)
    return this.mapTokens(response.data)
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const payload: RefreshTokenRequest = { refresh_token: refreshToken }
    const response = await this.client.axios.post<ApiAuthTokens>(`${BASE}/refresh`, payload)

    if (!response.data.access_token) {
      throw new ApiError('REFRESH_FAILED', 'Refresh response missing access_token')
    }

    return this.mapTokens(response.data, refreshToken)
  }

  async logout(): Promise<void> {
    try {
      await this.client.axios.post<void>(`${BASE}/logout`)
    } catch {
      // Best-effort logout: don't throw if server unreachable
    }
  }

  async getMe(): Promise<User> {
    const response = await this.client.axios.get<ApiUser>(`${BASE}/me`)
    return this.mapUser(response.data)
  }

  private mapTokens(data: ApiAuthTokens, fallbackRefresh?: string): AuthTokens {
    const expiresAt =
      data.expires_in != null
        ? Date.now() + data.expires_in * 1000
        : Date.now() + 60 * 60 * 1000

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? fallbackRefresh ?? '',
      expiresAt,
    }
  }

  private mapUser(data: ApiUser): User {
    return {
      id: data.id,
      telegramId: data.telegram_id,
      email: data.email,
      username: data.username,
      firstName: data.first_name,
      lastName: data.last_name,
      language: (data.language === 'en' ? 'en' : 'ru') as 'ru' | 'en',
      createdAt: data.created_at,
      linkedProviders: data.linked_providers as User['linkedProviders'],
    }
  }
}
