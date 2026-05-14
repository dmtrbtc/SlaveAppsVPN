/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: '#09090f',
          primary: '#0f0f14',
          secondary: '#14141c',
          tertiary: '#1a1a24',
          elevated: '#1e1e2a',
        },
        accent: {
          DEFAULT: '#6c63ff',
          hover: '#7c73ff',
          muted: 'rgba(108,99,255,0.15)',
          glow: 'rgba(108,99,255,0.4)',
        },
        connected: {
          DEFAULT: '#22c55e',
          muted: 'rgba(34,197,94,0.12)',
          glow: 'rgba(34,197,94,0.35)',
        },
        connecting: {
          DEFAULT: '#f59e0b',
          muted: 'rgba(245,158,11,0.12)',
        },
        error: {
          DEFAULT: '#ef4444',
          muted: 'rgba(239,68,68,0.12)',
        },
        border: {
          DEFAULT: '#2a2a38',
          subtle: '#1e1e2a',
          active: '#3d3d52',
        },
        text: {
          primary: '#f4f4f8',
          secondary: '#9898b8',
          muted: '#52526a',
          accent: '#8b84ff',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '24px',
      },
      boxShadow: {
        'accent-sm': '0 0 12px rgba(108,99,255,0.25)',
        'accent': '0 0 24px rgba(108,99,255,0.35)',
        'connected-sm': '0 0 12px rgba(34,197,94,0.25)',
        'connected': '0 0 32px rgba(34,197,94,0.4)',
        'connecting': '0 0 24px rgba(245,158,11,0.35)',
        'error': '0 0 24px rgba(239,68,68,0.35)',
        'card': '0 4px 24px rgba(0,0,0,0.4)',
        'card-hover': '0 8px 32px rgba(0,0,0,0.5)',
      },
      animation: {
        'fade-in': 'fadeIn 200ms ease-out',
        'fade-up': 'fadeUp 250ms ease-out',
        'spin-slow': 'spin 3s linear infinite',
        'breathe': 'breathe 3s ease-in-out infinite',
        'ping-slow': 'ping 2.5s cubic-bezier(0,0,0.2,1) infinite',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        breathe: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.8' },
          '50%': { transform: 'scale(1.04)', opacity: '1' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(34,197,94,0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(34,197,94,0.6)' },
        },
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      },
    },
  },
  plugins: [],
}
