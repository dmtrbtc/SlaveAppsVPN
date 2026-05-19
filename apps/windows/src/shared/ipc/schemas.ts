import { z } from 'zod'

export const LoginEmailSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
})

export const LoginTelegramSchema = z.object({
  initData: z.string().min(1).max(4096),
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
