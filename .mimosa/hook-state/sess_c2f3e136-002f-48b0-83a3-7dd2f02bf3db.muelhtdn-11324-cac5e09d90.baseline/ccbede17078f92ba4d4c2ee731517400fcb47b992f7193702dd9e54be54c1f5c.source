// SLAVE VPN — Aurora design tokens (TypeScript)
// Source of truth for both renderer and any future native (React Native) clients.

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 9999,
} as const

export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
} as const

export const font = {
  sans: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  mono: '"JetBrains Mono", "SF Mono", "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace',
} as const

export const fontSize = {
  displayXl: { size: 32, weight: 700, letterSpacing: '-0.025em' },
  displayL: { size: 22, weight: 700, letterSpacing: '-0.02em' },
  displayM: { size: 18, weight: 600, letterSpacing: '-0.01em' },
  displayS: { size: 15, weight: 600, letterSpacing: '-0.01em' },
  bodyL: { size: 14, weight: 500 },
  body: { size: 13, weight: 400 },
  bodyS: { size: 12, weight: 400 },
  caption: { size: 11, weight: 500 },
  micro: { size: 10, weight: 600, letterSpacing: '0.08em', uppercase: true },
} as const

export const shadow = {
  sm: '0 2px 6px rgba(15,23,42,0.05)',
  md: '0 8px 24px rgba(15,23,42,0.08)',
  lg: '0 24px 60px rgba(15,23,42,0.12)',
  card: '0 4px 24px rgba(15,23,42,0.08)',
} as const

// Two-mode palette. Always select via `palette[mode]`.
export const palette = {
  light: {
    bg: '#f4f1ec',
    surface: '#ffffff',
    surfaceRaised: '#ffffff',
    surfaceHover: '#f9f6f1',
    border: '#ece8df',
    borderStrong: '#dcd5c6',
    text: '#15131a',
    textDim: '#5a5466',
    textMute: '#9b94a6',
    accent: '#ff7a59',
    accent2: '#5b8def',
    accentSoft: 'rgba(255,122,89,0.12)',
    accentGlow: 'rgba(255,122,89,0.45)',
    ok: '#0fa86b',
    okSoft: 'rgba(15,168,107,0.12)',
    okGlow: 'rgba(15,168,107,0.45)',
    warn: '#d97706',
    warnSoft: 'rgba(217,119,6,0.12)',
    bad: '#e23636',
    badSoft: 'rgba(226,54,54,0.10)',
  },
  dark: {
    bg: '#100c1c',
    surface: '#1a1530',
    surfaceRaised: '#221c3d',
    surfaceHover: '#2a2349',
    border: '#2f2854',
    borderStrong: '#3f376b',
    text: '#f4eef9',
    textDim: '#aaa1c7',
    textMute: '#6e668c',
    accent: '#ff8a6b',
    accent2: '#7da6ff',
    accentSoft: 'rgba(255,138,107,0.16)',
    accentGlow: 'rgba(255,138,107,0.55)',
    ok: '#34d399',
    okSoft: 'rgba(52,211,153,0.16)',
    okGlow: 'rgba(52,211,153,0.55)',
    warn: '#fbbf24',
    warnSoft: 'rgba(251,191,36,0.16)',
    bad: '#f87171',
    badSoft: 'rgba(248,113,113,0.16)',
  },
} as const

export type ThemeMode = keyof typeof palette
export type ThemeTokens = typeof palette.light

export const motion = {
  hover: '140ms ease',
  state: '240ms cubic-bezier(0.4, 0, 0.2, 1)',
  spring: '280ms cubic-bezier(0.175, 0.885, 0.32, 1.275)',
  orbBreathe: '3.6s ease-in-out infinite',
  orbOrbit: '8s linear infinite',
} as const

// 5-phase connection lifecycle (used by the orb + phase tracker)
export const connectionPhases = [
  { id: 'auth',      label: 'Авторизация',           durationMs: 350 },
  { id: 'config',    label: 'Загрузка конфигурации', durationMs: 450 },
  { id: 'handshake', label: 'TLS-рукопожатие',       durationMs: 600 },
  { id: 'routing',   label: 'Применение маршрутов',  durationMs: 400 },
  { id: 'online',    label: 'Туннель установлен',    durationMs: 200 },
] as const

// Hit-target rules
export const hitTarget = {
  desktopMin: 32,
  desktopComfortable: 44,
  androidMin: 48,
  androidComfortable: 56,
} as const

export const tokens = {
  radius, spacing, font, fontSize, shadow, palette, motion,
  connectionPhases, hitTarget,
}

export default tokens
