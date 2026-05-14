export interface ApiAuthTokens {
  access_token: string
  refresh_token?: string
  token_type: string
  expires_in?: number
}

export interface ApiUser {
  id: string
  telegram_id?: number
  email?: string
  username?: string
  first_name?: string
  last_name?: string
  language: string
  created_at: string
  linked_providers: string[]
}

export interface LoginEmailRequest {
  email: string
  password: string
}

export interface LoginTelegramWidgetRequest {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

export interface DeepLinkTokenResponse {
  token: string
  tg_link: string
  expires_in_seconds: number
}

export interface PollDeepLinkResponse {
  status: 'pending' | 'confirmed' | 'expired'
  access_token?: string
  refresh_token?: string
}

export interface RefreshTokenRequest {
  refresh_token: string
}
