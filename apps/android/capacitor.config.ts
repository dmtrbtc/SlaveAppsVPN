import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.slavevpn.app',
  appName: 'SLAVE VPN',

  // Reuse the renderer bundle built by the Windows app.
  // Run `pnpm build:web` then `pnpm cap copy android` to refresh.
  webDir: '../windows/out/renderer',

  // Note: bundledWebRuntime removed in Capacitor 7 (was Capacitor-5 field;
  // global runtime is now always native-injected, no config needed).

  server: {
    androidScheme: 'https',
    // Allow cleartext so native HTTP (CapacitorHttp / OkHttp) can reach the
    // minority of subscription endpoints served over plain http://. The
    // WebView itself still loads the local bundle over the https scheme.
    cleartext: true,
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
