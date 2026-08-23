# Native VPN plugin

Despite the legacy `sample-native` directory name, these are the canonical
Android sources used by the committed Gradle project. The app module includes
this directory through:

```gradle
sourceSets {
    main.java.srcDir '../../sample-native/SlaveVpnPlugin'
}
```

The same module links the single tracked AAR directly:

```gradle
implementation files('../../libs/clashbox.aar')
```

No source or AAR copy step is required.

## Components

- `SlaveVpnPlugin.kt` — Capacitor API, VPN consent, split tunnelling, updater,
  traffic and diagnostics bridge.
- `SlaveVpnService.kt` — foreground `VpnService`, TUN lifecycle, network handoff,
  notification and Mihomo startup.
- `ClashBridge.kt` — typed facade over `com.slavevpn.clash.clashbox.*`.
- `SlaveVpnTileService.kt` — Quick Settings connect/disconnect tile.
- `BootReceiver.kt` — optional reconnect after device boot.

The manifest and `MainActivity` integration live in
`apps/android/android/app/src/main/`. The AAR rebuild script verifies every Java
signature consumed by `ClashBridge.kt`.

## Verification

```powershell
pnpm --filter @slave-vpn/android lint:android
pnpm --filter @slave-vpn/android build:android:debug
```

Android currently targets SDK 35 with minimum API 24 and JVM 21. The APK must
contain `libgojni.so` for `arm64-v8a` and `armeabi-v7a`.

## Still required

- Instrumented/device VPN tests
- Android-native persistent subscription storage
- Pinned, checksum-verified bundled geo databases
