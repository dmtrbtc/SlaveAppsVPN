export type SubscriptionStatus =
  | 'active'
  | 'expired'
  | 'limited'
  | 'paused'
  | 'none'

export type TrafficResetMode =
  | 'DAY'
  | 'WEEK'
  | 'MONTH'
  | 'MONTH_ROLLING'
  | 'NO_RESET'

export interface Subscription {
  id: string
  status: SubscriptionStatus
  tariffName: string
  expiresAt: string | null
  trafficUsedBytes: number
  trafficLimitGb: number
  trafficResetMode: TrafficResetMode
  deviceLimit: number
  devicesOnline: number
  autoRenew: boolean
  connectionLink: string | null
  createdAt: string
}

export interface Device {
  hwid: string
  name: string | null
  platform: string | null
  lastSeenAt: string
  isOnline: boolean
}

export interface RenewalOption {
  days: number
  priceKopeks: number
  label: string
  discountPercent: number
}

export interface TrialInfo {
  eligible: boolean
  durationDays: number
  trafficLimitGb: number
  deviceLimit: number
}

export interface CachedSubscription {
  data: Subscription
  cachedAt: number
  ttlMs: number
}
