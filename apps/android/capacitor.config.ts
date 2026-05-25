import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.slavevpn.app',
  appName: 'SLAVE VPN',

  // Reuse the renderer bundle built by the Windows app.
  // Run `pnpm build:web` then `pnpm cap copy android` to refresh.
  webDir: '../windows/out/renderer',

  bundledWebRuntime: false,

  server: {
    // Allow loading from `http://localhost` during dev; not used in release.
    androidScheme: 'https',
    cleartext: false,
  },

  android: {
    minWebViewVersion: 70,
    allowMixedContent: false,
    captureInput: true,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
    },
  },
}

export default config
