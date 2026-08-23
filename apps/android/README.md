# SLAVE VPN — Android

Capacitor 7 Android client reusing the React renderer from `apps/windows` and
embedding Mihomo through the verified `libs/clashbox.aar` artifact.

The native Gradle project is committed in `android/`. Kotlin sources and the AAR
remain single-source: Gradle reads them directly from `sample-native/` and
`libs/`, so `cap sync` cannot create stale duplicate copies.

## Prerequisites

- JDK 21
- Android SDK Platform 35 and Build Tools 35.0.0
- Android device or emulator on API 24+
- ARM device for VPN testing (`arm64-v8a` or `armeabi-v7a`)
- Node.js 20+ and pnpm 9

## Build

From the monorepo root:

```powershell
pnpm install
pnpm --filter "./packages/**" build
pnpm --filter @slave-vpn/windows build
pnpm --dir apps/android exec cap sync android
pnpm --filter @slave-vpn/android lint:android
pnpm --filter @slave-vpn/android build:android:debug
```

The debug APK is written to
`apps/android/android/app/build/outputs/apk/debug/app-debug.apk`.

For an unsigned release build, run:

```powershell
pnpm --filter @slave-vpn/android build:android
```

Release signing is configured when `ANDROID_KEYSTORE_PATH`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD` are
present. CI decodes the keystore secret, verifies the resulting certificate,
and falls back to a debug artifact when signing secrets are unavailable.

## Day-to-day workflow

```powershell
# Renderer/shared code changed
pnpm --filter @slave-vpn/windows build
pnpm --dir apps/android exec cap sync android

# Native code or manifest changed
pnpm --filter @slave-vpn/android lint:android
pnpm --filter @slave-vpn/android build:android:debug
```

Do not run `cap add android` again. Use `cap sync android`; the native project is
now reviewed source code rather than a disposable CI-generated directory.

## Layout

```text
apps/android/
├── android/                  committed Gradle/Capacitor project
├── brand-res/                launcher and Quick Settings artwork
├── clashbox-src/             Go wrapper and reproducible AAR build
├── libs/clashbox.aar         Mihomo v1.19.30, two ARM ABIs
├── sample-native/            canonical Kotlin plugin and VpnService sources
├── src/                      TypeScript Capacitor bridge
├── capacitor.config.ts
└── package.json
```

The app module registers `SlaveVpnPlugin`, declares the VPN foreground service,
Quick Settings tile, boot receiver, deep link, backup restrictions, and required
permissions. Android Lint runs in CI before every APK build.

## Remaining device checks

- VPN consent and first connection on a physical ARM64 phone
- TUN traffic, socket protection, DNS leak and kill-switch behaviour
- Wi-Fi/mobile hand-off and boot auto-connect
- Quick Settings tile and notification permission on Android 13+
- release-key install-over-existing-version

## Caveats

- Distributing the linked Mihomo AAR requires GPL-3.0 compliance and
  corresponding-source availability.
- Geo databases are not embedded in local builds yet; Mihomo uses the configured
  runtime download fallback. They should be pinned and checksum-verified before
  being added to release artifacts.
- `@slave-vpn/state-sync` still needs an Android-compatible SQLite backend before
  the desktop subscription cache can be reused directly.
