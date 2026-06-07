# SLAVE VPN — Android

Capacitor-based Android port. Reuses the React renderer from `apps/windows`.

> **Status:** Scaffold only. See [`docs/ANDROID.md`](../../docs/ANDROID.md)
> for the full architecture and roadmap (Phases I-A through I-F).

---

## Prerequisites

- JDK 17 (Temurin recommended)
- Android Studio Hedgehog+ with Android SDK 34
- A physical device or emulator (API 26+)
- Node 20 + pnpm 9 (same as monorepo)

---

## First-time setup

```bash
# 1. From monorepo root — install deps including Capacitor CLI
pnpm install

# 2. Build the shared React UI
pnpm --filter @slave-vpn/windows build

# 3. Initialise Android project (one-off — creates apps/android/android/)
cd apps/android
pnpm cap add android

# 4. Sync web bundle + plugin code into native project
pnpm cap sync android

# 5. Open in Android Studio
pnpm cap open android
```

---

## Day-to-day workflow

```bash
# When the renderer changes — rebuild web + copy
pnpm build:web && pnpm cap copy android

# When native (Kotlin) changes — sync to update plugin registration
pnpm cap sync android

# Build APK
pnpm build:android  # → android/app/build/outputs/apk/release/

# Install on connected device
cd android && ./gradlew installRelease
```

---

## What's here

```
apps/android/
├── capacitor.config.ts        ← Capacitor config, points webDir at Windows build
├── package.json
├── tsconfig.json
├── README.md                  ← you are here
└── src/
    ├── plugin/                ← TypeScript wrapper for the native plugin
    │   ├── SlaveVpnPlugin.ts  ← @capacitor/core registerPlugin('SlaveVpn')
    │   └── types.ts           ← Mirrors apps/windows/src/shared/ipc/types.ts
    └── bridge/
        └── bridge-shim.ts     ← Implements window.slaveVPN shape on Android
                                  (delegates to SlaveVpn capacitor plugin)
```

After `pnpm cap add android`, the native side appears at `android/`:

```
android/
├── app/src/main/
│   ├── AndroidManifest.xml         ← needs BIND_VPN_SERVICE permission
│   ├── java/com/slavevpn/
│   │   ├── MainActivity.kt
│   │   └── plugin/
│   │       ├── SlaveVpnPlugin.kt   ← Capacitor plugin (TODO)
│   │       └── SlaveVpnService.kt  ← VpnService impl (TODO)
│   └── res/
└── build.gradle
```

---

## What's NOT here yet

- `android/` directory — created by `pnpm cap add android` on first init
- `SlaveVpnPlugin.kt` — Kotlin plugin implementation
- `SlaveVpnService.kt` — VpnService with TUN setup
- JNI bridges to mihomo / sing-box .so libraries
- Android-specific tooling (e.g. notification icons, Quick Settings tile)

See [`docs/ANDROID.md`](../../docs/ANDROID.md) for the implementation order.

---

## Caveats

- **GPL implications**: bundling mihomo / sing-box as .so libs requires
  source disclosure. Plan release model accordingly (likely public-source
  Android build).
- **Better-sqlite3 dep**: `@slave-vpn/state-sync` won't work on Android
  without swap to sql.js or Capacitor SQLite plugin. Refactor before
  enabling Android subscription cache.
- **Service worker / cache**: Capacitor WebView caches aggressively. For
  releases, bump `version` in capacitor.config.ts to bust cache.
