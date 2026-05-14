export type ApiSubscriptionStatus = 'active' | 'expired' | 'limited' | 'paused'
export type ApiTrafficResetMode = 'DAY' | 'WEEK' | 'MONTH' | 'MONTH_ROLLING' | 'NO_RESET'

export interface ApiSubscription {
  id: string
  status: ApiSubscriptionStatus
  tariff_name: string
  expires_at: string | null
  traffic_used_bytes: number
  traffic_limit_gb: number
  traffic_reset_mode: ApiTrafficResetMode
  device_limit: number
  devices_online: number
  auto_renew: boolean
  created_at: string
}

export interface ApiDevice {
  hwid: string
  name: string | null
  platform: string | null
  last_seen_at: string
  is_online: boolean
}

export interface ApiConnectionLink {
  url: string
  expires_at?: string | null
}

export interface ApiRenewalOption {
  days: number
  price_kopeks: number
  label: string
  discount_percent: number
}

export interface ApiTrafficPackage {
  gb: number
  price_kopeks: number
}
