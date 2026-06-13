import { z } from 'zod'

export const LoginEmailSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
})

export const LoginTelegramSchema = z.object({
  initData: z.string().min(1).max(4096),
})

// ─── Personal cabinet ───────────────────────────────────────────────────────
export const CabinetPollSchema = z.object({
  token: z.string().min(1).max(512),
})

export const CabinetLoginEmailSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
})

export const CabinetRegisterSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(256),
  firstName: z.string().max(128).optional(),
})

export const CabinetVerifyEmailSchema = z.object({
  token: z.string().min(1).max(2048),
})

export const CabinetPasswordForgotSchema = z.object({
  email: z.string().email().max(254),
})

export const CabinetPasswordResetSchema = z.object({
  token: z.string().min(1).max(2048),
  password: z.string().min(8).max(256),
})

export const CabinetRemoveDeviceSchema = z.object({
  hwid: z.string().min(1).max(256),
})

export const CabinetRenewSchema = z.object({
  periodDays: z.number().int().positive().max(3650),
})

export const CabinetAutopaySchema = z.object({
  enabled: z.boolean(),
  daysBefore: z.number().int().min(0).max(30).optional(),
})

export const VpnSetModeSchema = z.object({
  mode: z.enum(['full', 'bypass', 'split', 'custom']),
})

export const RemoveDeviceSchema = z.object({
  hwid: z.string().min(1).max(256),
})

export const SettingsSetSchema = z
  .object({
    language: z.enum(['ru', 'en']).optional(),
    vpnMode: z.enum(['full', 'bypass', 'split', 'custom']).optional(),
    autoStart: z.boolean().optional(),
    minimizeToTray: z.boolean().optional(),
    notificationsEnabled: z.boolean().optional(),
    autoConnect: z.boolean().optional(),
    killSwitch: z.boolean().optional(),
    apiBaseUrl: z.string().url().max(512).optional(),
    telegramBotUsername: z.string().max(64).optional(),
    devMode: z.boolean().optional(),
    selectedEngine: z.enum(['mihomo', 'singbox', 'xray']).optional(),
    dnsPreset: z.enum(['secure', 'balanced', 'performance', 'minimal', 'custom']).optional(),
    dnsStrategy: z.enum(['prefer_ipv4', 'ipv4_only', 'prefer_ipv6', 'ipv6_only']).optional(),
    balancerEnabled: z.boolean().optional(),
    balancerMode: z.enum(['latency', 'stability', 'balanced', 'manual']).optional(),
    autoSelectProxy: z.boolean().optional(),
    selectedProxy: z.string().nullable().optional(),
    splitProcessList: z.array(z.string()).optional(),
    enabledScenarios: z.array(z.string()).optional(),
  })
  .strict()

export const ConfigSourceTypeSchema = z.enum(['provider', 'subscription-url', 'single-proxy', 'remnawave-key'])

export const ConfigSourceSetSchema = z.object({
  type: ConfigSourceTypeSchema,
  input: z.string().min(1).max(4096),
})

export const ConfigSourceValidateSchema = z.object({
  type: ConfigSourceTypeSchema,
  input: z.string().min(1).max(4096),
})

export const EmptySchema = z.undefined()

export type LoginEmailInput = z.infer<typeof LoginEmailSchema>
export type LoginTelegramInput = z.infer<typeof LoginTelegramSchema>
export type VpnSetModeInput = z.infer<typeof VpnSetModeSchema>
export type RemoveDeviceInput = z.infer<typeof RemoveDeviceSchema>
export type SettingsSetInput = z.infer<typeof SettingsSetSchema>
