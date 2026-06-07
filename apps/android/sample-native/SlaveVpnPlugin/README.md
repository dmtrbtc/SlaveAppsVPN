# Sample native plugin

These Kotlin files are **not part of any build yet**. They're a reference
implementation for the foundation of `SlaveVpnPlugin`.

## How to wire up

```bash
# 1. Initialise the native Android project (one-off)
cd apps/android
pnpm cap add android

# 2. Copy the sample plugin files into the generated project
mkdir -p android/app/src/main/java/com/slavevpn/plugin
cp sample-native/SlaveVpnPlugin/*.kt android/app/src/main/java/com/slavevpn/plugin/

# 3. Add the plugin's permissions to AndroidManifest.xml — see
#    android/app/src/main/AndroidManifest.xml after `cap add` —
#    add the <service> declaration and <uses-permission> lines listed below

# 4. Register the plugin in MainActivity
#    Inside MainActivity.kt's onCreate:
#      registerPlugin(SlaveVpnPlugin::class.java)

# 5. Sync + build
pnpm cap sync android
cd android && ./gradlew assembleDebug
```

### Manifest additions

```xml
<!-- android/app/src/main/AndroidManifest.xml -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />

<application ...>
  <service
    android:name="com.slavevpn.plugin.SlaveVpnService"
    android:permission="android.permission.BIND_VPN_SERVICE"
    android:foregroundServiceType="specialUse"
    android:exported="false">
    <intent-filter>
      <action android:name="android.net.VpnService" />
    </intent-filter>
    <property
      android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
      android:value="VPN tunnel for SLAVE VPN" />
  </service>
</application>
```

### Required Gradle deps

In `android/app/build.gradle` add:

```gradle
dependencies {
  implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.0'
  implementation 'androidx.core:core-ktx:1.13.0'
}
```

---

## What these files do

### `SlaveVpnPlugin.kt`
Capacitor plugin entry. Bridges TypeScript calls (`SlaveVpn.connect()`) to
the native VpnService. Handles VPN permission consent flow.

### `SlaveVpnService.kt`
Android VpnService impl. Establishes a TUN device with `Builder()`, runs
as a foreground service with persistent notification.

**Phase I-C scope:** TUN packets are read and discarded — proves the
service lifecycle works without engine integration.

**Phase I-D scope:** detach `tunFd` and hand it to `MihomoEngineBridge`
or `SingboxEngineBridge` (JNI to the native .so libraries — see
`docs/ANDROID.md` §4).

---

## What's NOT here

- `MihomoEngineBridge.kt` + `libmihomo.so` — Phase I-D
- `SingboxEngineBridge.kt` + `libbox.so` — Phase I-E
- `SubscriptionsBridge.kt` — Phase I-B (port `SubscriptionStore.ts` to Kotlin
  with EncryptedSharedPreferences)
- QuickSettingsTile — Phase I-F
- BootReceiver for auto-start — Phase I-F
