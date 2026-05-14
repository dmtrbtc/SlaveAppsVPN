export interface User {
  id: string
  telegramId?: number
  email?: string
  username?: string
  firstName?: string
  lastName?: string
  language: SupportedLanguage
  createdAt: string
  linkedProviders: AuthProvider[]
}

export type SupportedLanguage = 'ru' | 'en'

export type AuthProvider =
  | 'telegram'
  | 'email'
  | 'google'
  | 'yandex'
  | 'discord'
  | 'vk'

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

export interface TelegramLoginData {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}
