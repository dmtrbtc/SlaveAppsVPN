export const IpcChannel = {
  // Auth — request/response
  AUTH_LOGIN_EMAIL: 'auth:loginEmail',
  AUTH_LOGIN_TELEGRAM: 'auth:loginTelegram',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_ME: 'auth:me',
  AUTH_REFRESH: 'auth:refresh',

  // VPN — request/response
  VPN_CONNECT: 'vpn:connect',
  VPN_DISCONNECT: 'vpn:disconnect',
  VPN_GET_STATUS: 'vpn:getStatus',
  VPN_SET_MODE: 'vpn:setMode',

  // Subscription — request/response
  SUBSCRIPTION_GET: 'subscription:get',
  SUBSCRIPTION_REFRESH: 'subscription:refresh',
  SUBSCRIPTION_GET_DEVICES: 'subscription:getDevices',
  SUBSCRIPTION_REMOVE_DEVICE: 'subscription:removeDevice',

  // Settings — request/response
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',

  // Diagnostics — request/response
  DIAGNOSTICS_COLLECT: 'diagnostics:collect',
  DIAGNOSTICS_EXPORT_LOGS: 'diagnostics:exportLogs',
  DIAGNOSTICS_GET_LOGS: 'diagnostics:getLogs',

  // Provider — request/response
  PROVIDER_GET_MANIFEST: 'provider:getManifest',
  PROVIDER_GET_CAPABILITIES: 'provider:getCapabilities',

  // Window controls — request/response
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',

  // Events — main → renderer (push notifications)
  EVENT_VPN_STATUS: 'event:vpn:status',
  EVENT_VPN_TRAFFIC: 'event:vpn:traffic',
  EVENT_VPN_ERROR: 'event:vpn:error',
  EVENT_VPN_HEALTH: 'event:vpn:health',
  EVENT_RUNTIME_EVENT: 'event:runtime:event',
  EVENT_SUBSCRIPTION_UPDATED: 'event:subscription:updated',
  EVENT_AUTH_EXPIRED: 'event:auth:expired',
  EVENT_UPDATE_AVAILABLE: 'event:update:available',
  EVENT_UPDATE_DOWNLOADED: 'event:update:downloaded',
  EVENT_NOTIFICATION: 'event:notification',
} as const

export type IpcChannel = (typeof IpcChannel)[keyof typeof IpcChannel]
export type IpcInvokeChannel = (typeof IpcChannel)[
  | 'AUTH_LOGIN_EMAIL'
  | 'AUTH_LOGIN_TELEGRAM'
  | 'AUTH_LOGOUT'
  | 'AUTH_ME'
  | 'AUTH_REFRESH'
  | 'VPN_CONNECT'
  | 'VPN_DISCONNECT'
  | 'VPN_GET_STATUS'
  | 'VPN_SET_MODE'
  | 'SUBSCRIPTION_GET'
  | 'SUBSCRIPTION_REFRESH'
  | 'SUBSCRIPTION_GET_DEVICES'
  | 'SUBSCRIPTION_REMOVE_DEVICE'
  | 'SETTINGS_GET'
  | 'SETTINGS_SET'
  | 'DIAGNOSTICS_COLLECT'
  | 'DIAGNOSTICS_EXPORT_LOGS'
  | 'DIAGNOSTICS_GET_LOGS'
  | 'PROVIDER_GET_MANIFEST'
  | 'PROVIDER_GET_CAPABILITIES'
  | 'WINDOW_MINIMIZE'
  | 'WINDOW_MAXIMIZE'
  | 'WINDOW_CLOSE'
]
