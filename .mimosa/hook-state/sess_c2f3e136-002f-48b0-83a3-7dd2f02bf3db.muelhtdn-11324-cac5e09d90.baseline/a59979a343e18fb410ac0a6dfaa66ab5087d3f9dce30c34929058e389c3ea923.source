// Personal-cabinet (bedolaga-cabinet) domain types. Shapes mirror the live
// OpenAPI at cabinet.slave-apps.online/api (verified, not guessed). The cabinet
// is the user account layer on top of the Remnawave panel + Telegram bot.

/** Persisted auth tokens. expiresAt is an absolute epoch-ms deadline. */
export interface CabinetTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

/** Mapped from app__cabinet__schemas__auth__UserResponse. */
export interface CabinetUser {
  id: number
  telegramId: number | null
  username: string | null
  firstName: string | null
  lastName: string | null
  email: string | null
  emailVerified: boolean
  balanceKopeks: number
  balanceRubles: number
  referralCode: string | null
  language: string
  createdAt: string
  /** 'telegram' | 'email' | … — how this account authenticated. */
  authType: string
}

/** Mapped from SubscriptionData (the `subscription` field of /cabinet/subscription). */
export interface CabinetSubscription {
  id: number
  status: string
  isTrial: boolean
  startDate: string
  endDate: string
  daysLeft: number
  hoursLeft: number
  minutesLeft: number
  timeLeftDisplay: string
  trafficLimitGb: number
  trafficUsedGb: number
  trafficUsedPercent: number
  deviceLimit: number
  autopayEnabled: boolean
  isActive: boolean
  isExpired: boolean
  isLimited: boolean
  tariffName: string | null
  /** Raw subscription URL (may be null / hidden). SENSITIVE — used to auto-import a config source. */
  subscriptionUrl: string | null
}

/** /cabinet/subscription envelope. */
export interface CabinetSubscriptionStatus {
  hasSubscription: boolean
  subscription: CabinetSubscription | null
}

/** /cabinet/auth/deeplink/request response. */
export interface CabinetDeepLink {
  token: string
  botUsername: string
  /** Seconds until the token expires. */
  expiresIn: number
  /**
   * The /start payload the bot expects: `webauth_<token>`. The bot's start
   * handler ONLY treats `webauth_`-prefixed parameters as a cabinet login
   * (bare tokens are silently ignored as campaign/referral codes).
   */
  startParam: string
  /** Convenience deep link: https://t.me/<botUsername>?start=webauth_<token>. */
  tgLink: string
}

/** Result of polling a deep-link token. */
export type CabinetPollResult =
  | { status: 'pending' }
  | { status: 'confirmed'; user: CabinetUser }
  | { status: 'expired' }

/** One balance transaction (mapped from TransactionResponse). */
export interface CabinetTransaction {
  id: number
  /** 'deposit' | 'withdrawal' | … server-defined. */
  type: string
  amountKopeks: number
  amountRubles: number
  description: string | null
  paymentMethod: string | null
  isCompleted: boolean
  createdAt: string
}

export interface CabinetTransactionPage {
  items: CabinetTransaction[]
  total: number
  page: number
  pages: number
}

/** A connected device (HWID slot) of the subscription. */
export interface CabinetDevice {
  hwid: string
  platform: string
  deviceModel: string
  /** User-set alias (falls back to platform/model when null). */
  localName: string | null
}

export interface CabinetDeviceList {
  devices: CabinetDevice[]
  total: number
  deviceLimit: number
}

/** A renewal period offer (mapped from RenewalOptionResponse). */
export interface CabinetRenewalOption {
  periodDays: number
  priceKopeks: number
  priceRubles: number
  discountPercent: number
  originalPriceKopeks: number | null
}

/** Discriminated error codes surfaced to the UI. */
export type CabinetErrorCode =
  | 'AUTH_EXPIRED'      // tokens invalid and refresh failed → must re-login
  | 'INVALID_CREDENTIALS'
  | 'NOT_AUTHENTICATED' // no tokens stored
  | 'NETWORK'
  | 'SERVER'
  | 'PARSE'

export class CabinetError extends Error {
  constructor(public readonly code: CabinetErrorCode, message: string) {
    super(message)
    this.name = 'CabinetError'
  }
}
