import { getDefaultEnabledScenarios } from '@slave-vpn/routing'
import type { AppSettings } from './types.js'

/**
 * Build the default settings. Env-driven fields (apiBaseUrl, telegramBotUsername)
 * are passed as overrides by the platform — core must not read process.env so it
 * stays runnable in a renderer too.
 */
export function createDefaultSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  const base: AppSettings = {
    language: 'ru',
    vpnMode: 'bypass',
    autoStart: false,
    minimizeToTray: true,
    notificationsEnabled: true,
    autoConnect: false,
    killSwitch: false,
    apiBaseUrl: 'https://change-me.example.com/api',
    telegramBotUsername: '',
    devMode: false,
    updateChannel: 'stable',
    selectedEngine: 'mihomo',
    dnsPreset: 'secure',
    dnsStrategy: 'prefer_ipv4',
    customDnsProfile: null,
    balancerEnabled: false,
    balancerMode: 'balanced',
    autoSelectProxy: false,
    selectedProxy: null,
    splitProcessList: [],
    ruleProviders: [],
    enabledScenarios: getDefaultEnabledScenarios() as string[],
    utlsFingerprint: 'randomized',
  }
  return { ...base, ...overrides }
}
