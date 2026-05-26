#!/usr/bin/env bash
#
# build-android.sh — After scripts/setup-android.ps1, this script does:
#   1. Build shared web bundle (renderer used as Android UI)
#   2. pnpm cap add android (one-off, creates apps/android/android/)
#   3. Copy sample Kotlin plugin into the native project
#   4. Patch AndroidManifest.xml with VPN permissions + service
#   5. Sync Capacitor (copies web + plugin)
#   6. gradle assembleDebug → APK
#   7. Report APK path
#
# Run from monorepo root:  bash scripts/build-android.sh
#
# Re-running is idempotent — skips steps that already done.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_APP="$REPO_ROOT/apps/android"
SAMPLE_PLUGIN="$ANDROID_APP/sample-native/SlaveVpnPlugin"
NATIVE_PROJECT="$ANDROID_APP/android"
NATIVE_PLUGIN_DIR="$NATIVE_PROJECT/app/src/main/java/com/slavevpn/plugin"
MANIFEST="$NATIVE_PROJECT/app/src/main/AndroidManifest.xml"

log()  { echo "[build-android] $*"; }
fail() { echo "[build-android] ERROR: $*" >&2; exit 1; }

# ─── Sanity checks ────────────────────────────────────────────────────────────

log "Sanity checks..."
command -v java >/dev/null || fail "java not on PATH. Run scripts/setup-android.ps1 first."
command -v node >/dev/null || fail "node not on PATH. Install Node 20."
command -v pnpm >/dev/null || fail "pnpm not on PATH. Install pnpm."

if [ -z "${ANDROID_HOME:-}" ] && [ -z "${ANDROID_SDK_ROOT:-}" ]; then
  fail "ANDROID_HOME / ANDROID_SDK_ROOT not set. Run scripts/setup-android.ps1 and reopen terminal."
fi

JAVA_VER=$(java -version 2>&1 | head -1)
log "  $JAVA_VER"
log "  ANDROID_HOME=${ANDROID_HOME:-${ANDROID_SDK_ROOT}}"

# ─── 1. Build shared web bundle ───────────────────────────────────────────────

log "Building shared renderer (used as Android UI)..."
pnpm --filter @slave-vpn/windows build

# ─── 2. Install Capacitor deps + cap add android (one-off) ────────────────────

if [ ! -d "$NATIVE_PROJECT" ]; then
  log "Installing Capacitor deps in apps/android..."
  cd "$ANDROID_APP"
  pnpm install --ignore-workspace
  log "Running cap add android (one-off)..."
  npx cap add android
  cd "$REPO_ROOT"
else
  log "Native project already exists at apps/android/android — skipping cap add"
fi

# ─── 3. Copy sample Kotlin plugin ─────────────────────────────────────────────

if [ ! -f "$NATIVE_PLUGIN_DIR/SlaveVpnPlugin.kt" ]; then
  log "Copying sample Kotlin plugin..."
  mkdir -p "$NATIVE_PLUGIN_DIR"
  cp "$SAMPLE_PLUGIN/SlaveVpnPlugin.kt"  "$NATIVE_PLUGIN_DIR/"
  cp "$SAMPLE_PLUGIN/SlaveVpnService.kt" "$NATIVE_PLUGIN_DIR/"
  log "  → $NATIVE_PLUGIN_DIR/"
else
  log "Kotlin plugin already in place"
fi

# Register plugin in MainActivity (Capacitor 5+ auto-discovers via @CapacitorPlugin
# annotation if it's in classpath; no manual registration needed).
# But we add the package import in MainActivity comment for clarity:
MAIN_ACTIVITY="$NATIVE_PROJECT/app/src/main/java/com/slavevpn/app/MainActivity.kt"
if [ -f "$MAIN_ACTIVITY" ]; then
  log "MainActivity at $MAIN_ACTIVITY (auto-discovery active)"
fi

# ─── 4. Patch AndroidManifest with VPN permissions + service ──────────────────

if [ -f "$MANIFEST" ]; then
  if grep -q "BIND_VPN_SERVICE" "$MANIFEST"; then
    log "Manifest already has VPN permissions"
  else
    log "Patching AndroidManifest with VPN permissions + service..."
    # Insert permissions before <application>
    PERM_BLOCK='<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />\n    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />\n    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />\n    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />\n\n    '
    sed -i.bak "s|<application|$PERM_BLOCK<application|" "$MANIFEST"

    # Insert <service> just before </application>
    SERVICE_BLOCK='        <service\n            android:name="com.slavevpn.plugin.SlaveVpnService"\n            android:permission="android.permission.BIND_VPN_SERVICE"\n            android:foregroundServiceType="specialUse"\n            android:exported="false">\n            <intent-filter>\n                <action android:name="android.net.VpnService" />\n            <\/intent-filter>\n            <property\n                android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"\n                android:value="VPN tunnel for SLAVE VPN" \/>\n        <\/service>\n    '
    sed -i "s|</application>|$SERVICE_BLOCK</application>|" "$MANIFEST"

    log "  manifest patched"
  fi
fi

# Patch app/build.gradle to add kotlinx-coroutines dependency
APP_GRADLE="$NATIVE_PROJECT/app/build.gradle"
if [ -f "$APP_GRADLE" ]; then
  if ! grep -q "kotlinx-coroutines-android" "$APP_GRADLE"; then
    log "Adding kotlinx-coroutines + androidx.core dep to app/build.gradle..."
    sed -i.bak "s|dependencies {|dependencies {\n    implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.0'\n    implementation 'androidx.core:core-ktx:1.13.0'|" "$APP_GRADLE"
  else
    log "Dependencies already in app/build.gradle"
  fi
fi

# ─── 5. Sync Capacitor (web bundle + plugin) ──────────────────────────────────

log "Syncing Capacitor..."
cd "$ANDROID_APP"
npx cap copy android
npx cap sync android
cd "$REPO_ROOT"

# ─── 6. Gradle build ──────────────────────────────────────────────────────────

log "Building debug APK (gradle assembleDebug)..."
cd "$NATIVE_PROJECT"
chmod +x gradlew 2>/dev/null || true
./gradlew assembleDebug

APK_PATH="$NATIVE_PROJECT/app/build/outputs/apk/debug/app-debug.apk"
if [ -f "$APK_PATH" ]; then
  SIZE_MB=$(du -m "$APK_PATH" | cut -f1)
  log "✓ APK built: $APK_PATH ($SIZE_MB MB)"
  cp "$APK_PATH" "$REPO_ROOT/SlaveAppsVPN-Android-debug.apk"
  log "  copied to repo root: SlaveAppsVPN-Android-debug.apk"
else
  fail "APK not found at expected path"
fi

cd "$REPO_ROOT"

cat <<EOF

═══════════════════════════════════════════════════════════════
  ANDROID BUILD COMPLETE
═══════════════════════════════════════════════════════════════
  APK: SlaveAppsVPN-Android-debug.apk

  Install on phone:
    1) Copy APK to phone (USB / cloud)
    2) Open file → allow "Install from unknown sources"
    3) Open app

  Or via adb (phone in USB-debug mode):
    adb install SlaveAppsVPN-Android-debug.apk

  ⚠️ VPN backend is STUBBED in this build. UI works, "Connect"
  button shows error. Real VPN integration = Phase K.5 (libbox.aar
  via gomobile bind — separate task).

  Next: upload to GitHub release —
    gh release upload v0.2.0-rc1 SlaveAppsVPN-Android-debug.apk --repo dmtrbtc/SlaveAppsVPN

═══════════════════════════════════════════════════════════════
EOF
