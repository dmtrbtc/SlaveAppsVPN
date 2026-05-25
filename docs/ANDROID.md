# Android Port — Architecture & Roadmap

> **Status:** Foundation document. No working Android build yet — see
> "What's blocking" at the bottom. Use this as the master plan when starting
> real work.

---

## 1. Framework decision: Capacitor

We evaluated three options:

| Option | UI reuse | Native power | Effort |
|---|---|---|---|
| **Capacitor** ✅ | 95% React renderer reused | Full native via plugin | Lowest |
| React Native | Concepts reused, UI rewritten | Full native | Medium |
| Flutter | Nothing reused — total rewrite | Native via FFI/MethodChannel | Highest |

**Chosen: Capacitor.** Rationale:
- Existing `apps/windows/src/renderer/` is React 19 + Tailwind + Zustand
- Capacitor wraps that in a native WebView (Chrome on Android, WKWebView on iOS)
- Native VPN functionality goes through one Capacitor plugin (`SlaveVpnPlugin`)
- Tooling: `pnpm cap sync` + Android Studio for native side, normal `pnpm dev` for UI

Karing uses Flutter — they achieve great UX but rewrite everything. We
prioritise time-to-market.

---

## 2. Project structure

```
apps/
├── windows/          ← existing Electron app
├── android/          ← NEW Capacitor wrapper
│   ├── android/      ← Gradle project, native VpnService plugin
│   │   └── app/src/main/java/com/slavevpn/
│   │       ├── MainActivity.kt
│   │       └── plugin/
│   │           ├── SlaveVpnPlugin.kt           ← Capacitor plugin entry
│   │           ├── SlaveVpnService.kt           ← VpnService impl
│   │           ├── engines/
│   │           │   ├── MihomoEngineBridge.kt    ← JNI to libmihomo.so
│   │           │   └── SingboxEngineBridge.kt   ← JNI to libsbox.so
│   │           └── ipc/
│   │               └── SubscriptionsBridge.kt
│   ├── src/
│   │   ├── shared/   ← copied/symlinked from windows/src/shared
│   │   └── renderer/ ← reused from windows/src/renderer via tsconfig path
│   ├── capacitor.config.ts
│   ├── package.json
│   └── README.md
└── shared-mobile/    ← (future) cross-platform main-process logic
                       extracted from apps/windows/src/main/
```

Renderer is **shared**, not copied — Capacitor's `webDir` points at the
built output of the same React app that powers Windows.

---

## 3. What's portable from current monorepo

| Package | Portability | Notes |
|---|---|---|
| `@slave-vpn/shared` | ✅ Pure TS | Already platform-neutral |
| `@slave-vpn/dns` | ✅ Pure TS | Engine-neutral config types |
| `@slave-vpn/routing` | ✅ Pure TS | Scenarios + rule compiler |
| `@slave-vpn/config` | ✅ Pure TS | Mihomo YAML + Sing-box JSON generators |
| `@slave-vpn/runtime` | ⚠️ Partial | Uses `child_process` — NOT available on Android. JNI bridge required |
| `@slave-vpn/api` | ✅ Pure TS | HTTP fetch works fine |
| `@slave-vpn/state-sync` | ⚠️ Uses `better-sqlite3` | Replace with sql.js or expo-sqlite alternative |
| `@slave-vpn/provider*` | ✅ Pure TS | |
| Renderer React UI | ✅ As-is | All `apps/windows/src/renderer/` |

**Key insight:** The renderer talks to Electron via `window.slaveVPN`. On
Android the same shape comes from Capacitor plugin — implement the same
interface, the UI doesn't know the difference.

---

## 4. Native plugin design

Capacitor plugins expose methods to JS via `@capacitor/core`. We mirror
the existing IPC surface 1:1 so renderer code is identical.

### Plugin API (TypeScript wrapper)

```typescript
// apps/android/src/plugin.ts
import { registerPlugin } from '@capacitor/core'

export interface SlaveVpnPlugin {
  // VPN control
  connect(): Promise<void>
  disconnect(): Promise<void>
  getStatus(): Promise<{ state: string }>

  // Subscriptions (mirrors apps/windows/src/main/services/SubscriptionStore)
  listSubscriptions(): Promise<{ entries: SubscriptionEntry[] }>
  addSubscription(payload: SubscriptionAddPayload): Promise<{ entry: SubscriptionEntry }>
  // ... etc

  // Profiles, scenarios, DNS rules — all mirrored
}

export const SlaveVpn = registerPlugin<SlaveVpnPlugin>('SlaveVpn')
```

The renderer wraps this in the same `slaveVPN.*` shape — see
`apps/android/src/bridge-shim.ts` (to be written).

### Kotlin plugin entry

```kotlin
// SlaveVpnPlugin.kt
@CapacitorPlugin(
  name = "SlaveVpn",
  permissions = [Permission(strings = [Manifest.permission.INTERNET])]
)
class SlaveVpnPlugin : Plugin() {
  private var vpnService: SlaveVpnService? = null

  @PluginMethod
  fun connect(call: PluginCall) {
    val intent = VpnService.prepare(context)
    if (intent != null) {
      // Need user consent — start the system VPN-consent activity
      saveCall(call, "connect")
      activity.startActivityForResult(intent, REQ_VPN_PREPARE)
      return
    }
    startVpnService()
    call.resolve()
  }

  @PluginMethod
  fun disconnect(call: PluginCall) {
    vpnService?.stopVpn()
    call.resolve()
  }
}
```

### VpnService — establishes the tunnel

```kotlin
// SlaveVpnService.kt
class SlaveVpnService : VpnService() {
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val builder = Builder()
      .setSession("SLAVE VPN")
      .addAddress("172.19.0.1", 30)
      .addRoute("0.0.0.0", 0)
      .addDnsServer("8.8.8.8")
      .setMtu(9000)

    val tunFd = builder.establish() ?: return START_NOT_STICKY
    val tunFdInt = tunFd.detachFd()

    // Hand TUN fd to the engine (mihomo or sing-box via JNI)
    val engineType = currentEngineType()
    when (engineType) {
      "mihomo" -> MihomoEngineBridge.start(tunFdInt, configPath)
      "singbox" -> SingboxEngineBridge.start(tunFdInt, configPath)
    }
    return START_STICKY
  }
}
```

### JNI bridges

Mihomo and sing-box ship `.so` libraries on Android (or we build from
Go source). The bridge is a thin layer:

```kotlin
// MihomoEngineBridge.kt
object MihomoEngineBridge {
  init { System.loadLibrary("mihomo") }
  external fun start(tunFd: Int, configPath: String): Int
  external fun stop(): Int
  external fun queryStats(): String  // JSON
}
```

Upstream sources:
- **Mihomo:** https://github.com/MetaCubeX/mihomo — has `golang/cmd/mobile` Go binding (build with gomobile → libmihomo.aar)
- **Sing-box:** https://github.com/SagerNet/sing-box — built-in `libbox/` package for mobile builds, used by hiddify/karing

---

## 5. Build flow

```bash
# 1. Build the shared renderer (produces out/renderer/index.html + JS)
pnpm --filter @slave-vpn/windows build  # reused

# 2. Copy web assets into Capacitor's webDir
pnpm --filter @slave-vpn/android cap copy

# 3. Sync (after plugin changes)
pnpm --filter @slave-vpn/android cap sync android

# 4. Build native APK
cd apps/android/android && ./gradlew assembleRelease

# 5. Test on connected device
./gradlew installRelease
```

CI: GitHub Actions matrix builds Windows + Android in parallel.

---

## 6. Differences from Windows

| Aspect | Windows | Android |
|---|---|---|
| TUN | WinTUN driver + named adapter | VpnService.Builder + tunFd |
| Spawn engine | `child_process.spawn(mihomo.exe)` | `System.loadLibrary("mihomo").start(tunFd)` |
| User data | `app.getPath('userData')` | `context.filesDir` |
| Notifications | Electron Notification | Android NotificationChannel |
| Auto-start | Login items | BOOT_COMPLETED receiver |
| Subscription URL | Direct HTTPS | Same, via OkHttp |
| Storage | SecureStorage (safeStorage) | EncryptedSharedPreferences |
| Tray | Electron Tray | Persistent notification + tile (Android 7+) |

---

## 7. Implementation phases

### I-A: Scaffolding (1 day)
- `apps/android/` Capacitor project
- Capacitor config pointing at shared renderer build
- AndroidManifest.xml with `BIND_VPN_SERVICE` permission
- Empty SlaveVpnPlugin that resolves without doing anything
- **Result:** APK installs, opens, shows React UI, every IPC call is a no-op

### I-B: Subscription + scenarios (3 days)
- Port SubscriptionStore to Kotlin (EncryptedSharedPreferences)
- Port ConfigGenerator/SingboxConfigCompiler — can run in JS thread
  (Capacitor exposes Node-like APIs via `@capacitor/filesystem`)
- Settings persistence
- **Result:** Add subscription, edit scenarios, view DNS settings — all
  works without actually connecting

### I-C: VpnService basic (1 week)
- VpnService.Builder establishes TUN
- Pass TUN fd to mihomo (no real engine logic — just open/close socket)
- Connect/disconnect from UI works
- Notification with disconnect action
- **Result:** Shows "connected" but doesn't actually route traffic

### I-D: Real engine integration (2 weeks)
- Build libmihomo.so (gomobile) OR pull from upstream `mihomo-android` release
- JNI bridge: start(tunFd, configPath), stop(), version()
- Wire ConfigGenerator output to libmihomo
- Test real VLESS Reality connection through TUN
- **Result:** Actual VPN works

### I-E: Sing-box engine (1 week)
- Build `libbox.so` from sing-box Mobile API
- Sing-box bridge similar to mihomo
- Engine switcher works
- **Result:** Both engines work

### I-F: Polish (1 week)
- Background killing handling (foreground service)
- Battery optimisation whitelist prompt
- Quick Settings tile for fast toggle
- Always-on VPN support
- Per-app split tunneling via VpnService.addDisallowedApplication
- **Result:** Production-ready

**Total: ~5 weeks calendar time.**

---

## 8. What's blocking real Android development right now

| Blocker | How to unblock |
|---|---|
| No Android Studio in current dev env | Install JDK 17 + Android Studio + Android SDK |
| No mobile engine .so files | Either build from upstream Go sources (gomobile) or pull pre-built from hiddify/karing releases |
| No Android device for testing | Physical device or emulator (slower but workable) |
| Code signing for Play Store | Create upload key + register on Play Console ($25 one-off) |
| State-sync uses better-sqlite3 native | Replace with sql.js (WASM) or use Capacitor's native SQLite plugin |

---

## 9. License considerations

- **mihomo:** GPL-3.0 — bundling its .so as a library means SLAVE VPN
  Android source must also be GPL-3.0 OR offered under a separate license
  with proper attribution. Karing handles this; we should too.
- **sing-box:** GPL-3.0 — same constraint.
- **Capacitor:** MIT — no issue.
- **wintun:** GPLv2 — Windows-only, not relevant for Android.

The Android build will likely need to be public-source. Plan accordingly.

---

## 10. References

- Capacitor: https://capacitorjs.com/docs/android
- Android VpnService: https://developer.android.com/reference/android/net/VpnService
- Mihomo mobile: https://github.com/MetaCubeX/mihomo/tree/Alpha (gomobile build)
- Sing-box mobile: https://github.com/SagerNet/sing-box/tree/dev-next/experimental/libbox
- Karing source: https://github.com/KaringX/karing — Flutter but their
  native engine integration is a good reference

---

## TL;DR

Capacitor wraps existing React UI. Native VpnService + JNI bridges to mihomo
and sing-box .so libraries. Renderer code is shared with Windows verbatim.
5 weeks to production. Real work blocked on Android tooling availability —
this doc + scaffolding (I.1, I.2) gets us ready to start.
