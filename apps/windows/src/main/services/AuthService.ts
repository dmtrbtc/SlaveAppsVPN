import type { AuthTokens, User } from '@slave-vpn/shared'

export interface AuthService {
  loginEmail(email: string, password: string): Promise<AuthTokens>
  loginTelegram(initData: string): Promise<AuthTokens>
  logout(): Promise<void>
  getMe(): Promise<User>
  refresh(): Promise<AuthTokens>
}
