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
  VPN_GET_CONNECTIVITY: 'vpn:getConnectivity',

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
  DIAGNOSTICS_GET_STARTUP: 'diagnostics:getStartup',

  // Provider — request/response
  PROVIDER_GET_MANIFEST: 'provider:getManifest',
  PROVIDER_GET_CAPABILITIES: 'provider:getCapabilities',

  // Config source — request/response
  CONFIG_SOURCE_GET_META: 'config-source:getMeta',
  CONFIG_SOURCE_SET: 'config-source:set',
  CONFIG_SOURCE_VALIDATE: 'config-source:validate',
  CONFIG_SOURCE_CLEAR: 'config-source:clear',

  // Servers — request/response
  SERVERS_LIST: 'servers:list',
  SERVERS_PROBE: 'servers:probe',

  // Safe mode — request/response
  SAFE_MODE_GET_STATUS: 'safeMode:getStatus',
  SAFE_MODE_RESET: 'safeMode:reset',

  // Updates — request/response
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install',
  UPDATE_GET_STATUS: 'update:getStatus',
  UPDATE_SET_CHANNEL: 'update:setChannel',

  // Runtime controls — request/response
  RUNTIME_RESTART: 'runtime:restart',

  // Cache — request/response
  CACHE_CLEAR: 'cache:clear',

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
  EVENT_UPDATE_PROGRESS: 'event:update:progress',
  EVENT_NOTIFICATION: 'event:notification',
  EVENT_SERVER_LATENCY: 'event:server:latency',

  // VPN extended
  VPN_SET_PROXY: 'vpn:setProxy',
  VPN_GET_PROXY_LIST: 'vpn:getProxyList',
  VPN_GET_CONNECTIONS: 'vpn:getConnections',
  VPN_CLOSE_CONNECTION: 'vpn:closeConnection',

  // Balancer
  VPN_GET_BALANCER_STATE: 'vpn:getBalancerState',
  VPN_SET_BALANCER_ENABLED: 'vpn:setBalancerEnabled',
  VPN_SET_BALANCER_MODE: 'vpn:setBalancerMode',
  VPN_PROBE_ALL: 'vpn:probeAll',

  // DNS
  DNS_GET_PROFILE: 'dns:getProfile',
  DNS_SET_PROFILE: 'dns:setProfile',
  DNS_GET_PRESETS: 'dns:getPresets',
  DNS_GET_STRATEGIES: 'dns:getStrategies',
  DNS_LEAK_TEST: 'diag:dnsLeakTest',

  // Rules
  RULES_LIST: 'rules:list',
  RULES_ADD: 'rules:add',
  RULES_REMOVE: 'rules:remove',
  RULES_REORDER: 'rules:reorder',
  RULES_UPDATE: 'rules:update',
  RULES_RELOAD: 'rules:reload',

  // Routing scenarios (Karing-style recipes)
  ROUTING_LIST_SCENARIOS: 'routing:listScenarios',
  ROUTING_SET_ENABLED_SCENARIOS: 'routing:setEnabledScenarios',

  // Multi-subscription manager (B.1)
  SUBSCRIPTIONS_LIST: 'subscriptions:list',
  SUBSCRIPTIONS_ADD: 'subscriptions:add',
  SUBSCRIPTIONS_REMOVE: 'subscriptions:remove',
  SUBSCRIPTIONS_UPDATE: 'subscriptions:update',
  SUBSCRIPTIONS_REFRESH: 'subscriptions:refresh',
  SUBSCRIPTIONS_REFRESH_ALL: 'subscriptions:refreshAll',
  SUBSCRIPTIONS_DETECT_CLIPBOARD: 'subscriptions:detectClipboard',
  EVENT_SUBSCRIPTIONS_CHANGED: 'event:subscriptions:changed',

  // Split tunnel
  SPLIT_GET_PROCESSES: 'split:getProcesses',
  SPLIT_SET_PROCESS_LIST: 'split:setProcessList',
  SPLIT_GET_PROCESS_LIST: 'split:getProcessList',

  // Events
  EVENT_BALANCER_STATE: 'event:balancer:state',
  EVENT_PROXY_CHANGED: 'event:proxy:changed',
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
  | 'VPN_GET_CONNECTIVITY'
  | 'SUBSCRIPTION_GET'
  | 'SUBSCRIPTION_REFRESH'
  | 'SUBSCRIPTION_GET_DEVICES'
  | 'SUBSCRIPTION_REMOVE_DEVICE'
  | 'SETTINGS_GET'
  | 'SETTINGS_SET'
  | 'DIAGNOSTICS_COLLECT'
  | 'DIAGNOSTICS_EXPORT_LOGS'
  | 'DIAGNOSTICS_GET_LOGS'
  | 'DIAGNOSTICS_GET_STARTUP'
  | 'PROVIDER_GET_MANIFEST'
  | 'PROVIDER_GET_CAPABILITIES'
  | 'CONFIG_SOURCE_GET_META'
  | 'CONFIG_SOURCE_SET'
  | 'CONFIG_SOURCE_VALIDATE'
  | 'CONFIG_SOURCE_CLEAR'
  | 'SERVERS_LIST'
  | 'SERVERS_PROBE'
  | 'SAFE_MODE_GET_STATUS'
  | 'SAFE_MODE_RESET'
  | 'UPDATE_CHECK'
  | 'UPDATE_DOWNLOAD'
  | 'UPDATE_INSTALL'
  | 'UPDATE_GET_STATUS'
  | 'UPDATE_SET_CHANNEL'
  | 'RUNTIME_RESTART'
  | 'CACHE_CLEAR'
  | 'WINDOW_MINIMIZE'
  | 'WINDOW_MAXIMIZE'
  | 'WINDOW_CLOSE'
  | 'VPN_SET_PROXY'
  | 'VPN_GET_PROXY_LIST'
  | 'VPN_GET_CONNECTIONS'
  | 'VPN_CLOSE_CONNECTION'
  | 'VPN_GET_BALANCER_STATE'
  | 'VPN_SET_BALANCER_ENABLED'
  | 'VPN_SET_BALANCER_MODE'
  | 'VPN_PROBE_ALL'
  | 'DNS_GET_PROFILE'
  | 'DNS_SET_PROFILE'
  | 'DNS_GET_PRESETS'
  | 'DNS_GET_STRATEGIES'
  | 'DNS_LEAK_TEST'
  | 'RULES_LIST'
  | 'RULES_ADD'
  | 'RULES_REMOVE'
  | 'RULES_REORDER'
  | 'RULES_UPDATE'
  | 'RULES_RELOAD'
  | 'ROUTING_LIST_SCENARIOS'
  | 'ROUTING_SET_ENABLED_SCENARIOS'
  | 'SUBSCRIPTIONS_LIST'
  | 'SUBSCRIPTIONS_ADD'
  | 'SUBSCRIPTIONS_REMOVE'
  | 'SUBSCRIPTIONS_UPDATE'
  | 'SUBSCRIPTIONS_REFRESH'
  | 'SUBSCRIPTIONS_REFRESH_ALL'
  | 'SUBSCRIPTIONS_DETECT_CLIPBOARD'
  | 'SPLIT_GET_PROCESSES'
  | 'SPLIT_SET_PROCESS_LIST'
  | 'SPLIT_GET_PROCESS_LIST'
]
