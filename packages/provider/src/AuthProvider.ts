import type { AuthTokens, User } from '@slave-vpn/shared'

export interface TelegramFlowHandle {
  promise: Promise<AuthTokens>
  cancel: () => void
}

export interface TelegramDeepLinkCallbacks {
  onLinkReady: (link: string) => void
}

export interface AuthProvider {
  loginEmail(email: string, password: string): Promise<AuthTokens>
  loginTelegram(initData: string): Promise<AuthTokens>
  startTelegramDeepLinkFlow(callbacks: TelegramDeepLinkCallbacks): TelegramFlowHandle
  logout(): Promise<void>
  getMe(): Promise<User>
}
