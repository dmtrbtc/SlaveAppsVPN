/** @type {import('tailwindcss').Config} */

// SLAVE VPN — Aurora design tokens
// Drop-in replacement for apps/windows/tailwind.config.js
// Compatible with the existing token structure (bg/accent/connected/...)

export default {
  content: ['./src/renderer/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class', // toggle via <html class="dark">
  theme: {
    extend: {
      colors: {
        // ─── Surface ────────────────────────────────────────
        bg: {
          base: '#f4f1ec',          // light default
          dark: '#100c1c',          // dark variant
          primary: '#ffffff',
          'primary-dark': '#1a1530',
          secondary: '#f9f6f1',
          'secondary-dark': '#221c3d',
          tertiary: '#f4f1ec',
          'tertiary-dark': '#2a2349',
          elevated: '#ffffff',
          'elevated-dark': '#221c3d',
        },
        // ─── Brand accent (dual coral + sky) ─────────────────
        accent: {
          DEFAULT: '#ff7a59',         // coral, light theme
          dark: '#ff8a6b',            // coral, dark theme
          2: '#5b8def',               // sky, light theme  (use as: bg-accent-2)
          '2-dark': '#7da6ff',
          hover: '#ff8a6b',
          muted: 'rgba(255,122,89,0.12)',
          glow: 'rgba(255,122,89,0.45)',
        },
        // ─── Connection states ───────────────────────────────
        connected: {
          DEFAULT: '#0fa86b',
          dark: '#34d399',
          muted: 'rgba(15,168,107,0.12)',
          glow: 'rgba(15,168,107,0.45)',
        },
        connecting: {
          DEFAULT: '#d97706',
          dark: '#fbbf24',
          muted: 'rgba(217,119,6,0.12)',
        },
        error: {
          DEFAULT: '#e23636',
          dark: '#f87171',
          muted: 'rgba(226,54,54,0.10)',
        },
        // ─── Border ──────────────────────────────────────────
        border: {
          DEFAULT: '#ece8df',
          dark: '#2f2854',
          subtle: '#f9f6f1',
          'subtle-dark': '#221c3d',
          strong: '#dcd5c6',
          'strong-dark': '#3f376b',
        },
        // ─── Text ────────────────────────────────────────────
        text: {
          primary: '#15131a',
          'primary-dark': '#f4eef9',
          secondary: '#5a5466',
          'secondary-dark': '#aaa1c7',
          muted: '#9b94a6',
          'muted-dark': '#6e668c',
          accent: '#ff7a59',
          'accent-dark': '#ff8a6b',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'system-ui', 'sans-serif'],
        display: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', '"IBM Plex Mono"', 'ui-monospace', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        // Display
        'display-xl': ['32px', { lineHeight: '1.1', letterSpacing: '-0.025em', fontWeight: '700' }],
        'display-l': ['22px', { lineHeight: '1.15', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-m': ['18px', { lineHeight: '1.25', letterSpacing: '-0.01em', fontWeight: '600' }],
        'display-s': ['15px', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '600' }],
        // Body
        'body-l': ['14px', { lineHeight: '1.5' }],
        body: ['13px', { lineHeight: '1.5' }],
        'body-s': ['12px', { lineHeight: '1.55' }],
        caption: ['11px', { lineHeight: '1.4' }],
        micro: ['10px', { lineHeight: '1.3', letterSpacing: '0.08em', fontWeight: '600' }],
      },
      borderRadius: {
        sm: '10px',
        md: '16px',
        lg: '22px',
        xl: '28px',
        '2xl': '28px',  // override default for Aurora's softer look
        '3xl': '32px',
      },
      spacing: {
        // Aurora uses standard 4px scale, no overrides needed
      },
      boxShadow: {
        sm: '0 2px 6px rgba(15,23,42,0.05)',
        DEFAULT: '0 8px 24px rgba(15,23,42,0.08)',
        md: '0 8px 24px rgba(15,23,42,0.08)',
        lg: '0 24px 60px rgba(15,23,42,0.12)',
        // Status-driven glow
        'accent-sm': '0 0 12px rgba(255,122,89,0.25)',
        accent: '0 0 24px rgba(255,122,89,0.35)',
        'connected-sm': '0 0 12px rgba(15,168,107,0.25)',
        connected: '0 0 32px rgba(15,168,107,0.4)',
        connecting: '0 0 24px rgba(217,119,6,0.35)',
        error: '0 0 24px rgba(226,54,54,0.35)',
        // Cards
        card: '0 4px 24px rgba(15,23,42,0.08)',
        'card-hover': '0 8px 32px rgba(15,23,42,0.12)',
        // Orb-specific
        orb: '0 24px 64px rgba(255,122,89,0.40)',
        'orb-connected': '0 24px 64px rgba(15,168,107,0.45), inset 0 -8px 24px rgba(255,255,255,0.2)',
      },
      animation: {
        'fade-in': 'fadeIn 200ms ease-out',
        'fade-up': 'fadeUp 250ms ease-out',
        'spin-slow': 'spin 3s linear infinite',
        breathe: 'breathe 3.6s ease-in-out infinite',
        'orb-orbit': 'orbit 8s linear infinite',
        'ping-slow': 'ping 2.5s cubic-bezier(0,0,0.2,1) infinite',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        sweep: 'sweep 2.6s linear infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        breathe: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.85' },
          '50%': { transform: 'scale(1.04)', opacity: '1' },
        },
        orbit: { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(15,168,107,0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(15,168,107,0.6)' },
        },
        sweep: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(200%)' },
        },
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      backgroundImage: {
        'gradient-aurora': 'linear-gradient(135deg, #ff7a59 0%, #5b8def 100%)',
        'gradient-aurora-dark': 'linear-gradient(135deg, #ff8a6b 0%, #7da6ff 100%)',
      },
    },
  },
  plugins: [],
}
