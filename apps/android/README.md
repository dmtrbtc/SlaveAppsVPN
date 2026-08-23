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
pnpm --filter @slave-vpn/android sync -- android
pnpm --filter @slave-vpn/android lint:android
pnpm --filter @slave-vpn/android build:android:debug
```

The debug APK is written to
`apps/android/android/app/build/outputs/apk/debug/app-debug.apk`.

If a production-signed build is already installed, create a side-by-side debug
package instead of deleting its data:

```powershell
$env:ORG_GRADLE_PROJECT_slaveApplicationIdSuffix = "dev"
$env:ORG_GRADLE_PROJECT_slaveVersionCode = "181"
$env:ORG_GRADLE_PROJECT_slaveVersionName = "0.0.1-dev.181"
node apps/android/scripts/run-gradle.mjs assembleDebug
```

This produces `com.slavevpn.app.dev`; the suffix is applied only to debug builds.

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
pnpm --filter @slave-vpn/android sync -- android

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
permissions. Its host-side `go.LoadJNI` shim loads the gomobile JNI library and
passes the Android application context before the first Mihomo call, including
service starts initiated by the boot receiver or Quick Settings tile. Android
Lint runs in CI before every APK build.

## Device-test status

Validated on a physical ARM64 Android 16 device:

- VPN consent, guest onboarding and authenticated subscription flow
- Mihomo startup, TUN traffic, socket protection and encrypted DNS
- blocked-site and Telegram routing through the selected proxy group
- Wi-Fi/mobile hand-off, foreground notification and Quick Settings tile
- Activity recreation without interrupting the VPN
- cold-process recovery from the cached config

Process recovery keeps a separate persisted `shouldRun` flag. A sticky-service
restart with a null Intent restores only when that flag is true; opening a cold
Activity provides the same recovery path on OEM builds that delay the sticky
restart. A deliberate Disconnect clears the flag, so reopening the app cannot
silently reconnect. Android force-stop remains OS-enforced and requires a user
action before any application component may run again.

Still required before stable release:

- independent external DNS-leak test and OS Always-on/lockdown kill switch
- boot auto-connect on the release candidate
- release-key install-over-existing-version
- API 24/29/33 and non-HyperOS device coverage

## Caveats

- Distributing the linked Mihomo AAR requires GPL-3.0 compliance and
  corresponding-source availability.
- Geo databases are not embedded in local builds yet; Mihomo uses the configured
  runtime download fallback. They should be pinned and checksum-verified before
  being added to release artifacts.
- `@slave-vpn/state-sync` still needs an Android-compatible SQLite backend before
  the desktop subscription cache can be reused directly.
