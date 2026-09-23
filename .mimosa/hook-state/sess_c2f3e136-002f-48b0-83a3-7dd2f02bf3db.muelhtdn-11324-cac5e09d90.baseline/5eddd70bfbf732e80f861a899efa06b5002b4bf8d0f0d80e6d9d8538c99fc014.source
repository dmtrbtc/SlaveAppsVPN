import type { SupportedLanguage } from '@slave-vpn/shared'
import ru from './locales/ru.json'
import en from './locales/en.json'

export type LocaleMessages = typeof ru

const locales: Record<SupportedLanguage, LocaleMessages> = { ru, en }

export type { SupportedLanguage }
export { ru, en }

export function getLocale(lang: SupportedLanguage): LocaleMessages {
  return locales[lang] ?? ru
}

type PathsOf<T, Prefix extends string = ''> = T extends object
  ? {
      [K in keyof T]: K extends string
        ? PathsOf<T[K], Prefix extends '' ? K : `${Prefix}.${K}`>
        : never
    }[keyof T]
  : Prefix

export type TranslationKey = PathsOf<LocaleMessages>

export function t(
  messages: LocaleMessages,
  key: TranslationKey,
  vars?: Record<string, string | number>
): string {
  const value = key.split('.').reduce<unknown>((obj, k) => {
    if (obj !== null && typeof obj === 'object' && k in (obj as object)) {
      return (obj as Record<string, unknown>)[k]
    }
    return undefined
  }, messages)

  if (typeof value !== 'string') return key

  if (!vars) return value

  return Object.entries(vars).reduce(
    (result, [varKey, varValue]) => result.replaceAll(`{{${varKey}}}`, String(varValue)),
    value
  )
}
