export const APP_NAME = 'SLAVE VPN'
export const APP_VERSION = '__APP_VERSION__'

export const API = {
  TIMEOUT_MS: 15_000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 1_000,
  CACHE_TTL_MS: {
    SUBSCRIPTION: 5 * 60 * 1_000,
    SERVER_LIST: 60 * 60 * 1_000,
    USER_PROFILE: 10 * 60 * 1_000,
  },
} as const

export const VPN = {
  MIHOMO_API_PORT: 9090,
  MIHOMO_MIXED_PORT: 7890,
  MIHOMO_EXTERNAL_CONTROLLER: '127.0.0.1:9090',
  HEALTH_CHECK_INTERVAL_MS: 30_000,
  RECONNECT_ATTEMPTS: 3,
  RECONNECT_DELAY_MS: 2_000,
  RECONNECT_BACKOFF_MULTIPLIER: 2,
  TRAFFIC_POLL_INTERVAL_MS: 1_000,
} as const

export const ROUTING = {
  RULES_UPDATE_INTERVAL_MS: 24 * 60 * 60 * 1_000,
  RULES_CACHE_TTL_MS: 7 * 24 * 60 * 60 * 1_000,
} as const

export const STORAGE = {
  DB_FILENAME: 'slavevpn.db',
  TOKENS_KEY: 'auth.tokens',
  SETTINGS_KEY: 'app.settings',
} as const

export const TELEGRAM = {
  DEEP_LINK_BASE: 'tg://resolve?domain=',
  WEB_LINK_BASE: 'https://t.me/',
} as const
