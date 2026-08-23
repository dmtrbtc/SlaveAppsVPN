/*
 * Capacitor native bridge for the committed Android application. Gradle reads
 * this canonical source directory directly; MainActivity registers the plugin
 * and SlaveVpnService routes the TUN through the embedded Mihomo AAR.
 */

package com.slavevpn.plugin

import android.Manifest
import android.app.Activity
import android.app.DownloadManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInstaller
import android.net.Uri
import android.net.VpnService
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.activity.result.ActivityResult
import androidx.core.content.ContextCompat
import java.io.File
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.slavevpn.app.R

@CapacitorPlugin(
    name = "SlaveVpn",
    permissions = [
        Permission(strings = [Manifest.permission.INTERNET]),
        Permission(strings = [Manifest.permission.FOREGROUND_SERVICE]),
        Permission(strings = [Manifest.permission.POST_NOTIFICATIONS]),
    ]
)
class SlaveVpnPlugin : Plugin() {

    // Prompt to add the QS tile at most once per app session (and never again
    // once the tile is added). MIUI/HyperOS hides third-party tiles from the
    // edit tray, so we surface them via the system requestAddTileService dialog.
    private var tilePromptedThisSession = false

    // Request code for the POST_NOTIFICATIONS runtime grant (Android 13+).
    private val REQ_POST_NOTIFICATIONS = 8201

    // Connect parameters stashed while the VpnService.prepare() consent dialog is
    // shown — read back in onVpnConnectResult once consent returns.
    private var pendingConfig: String? = null
    private var pendingSelected: String? = null
    private var pendingSplitMode: String = "off"
    private var pendingSplitApps: List<String> = emptyList()
    private var pendingKillSwitch: Boolean = false

    @PluginMethod
    fun checkPermission(call: PluginCall) {
        val intent = VpnService.prepare(context)
        val result = JSObject().put("granted", intent == null)
        call.resolve(result)
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        val intent = VpnService.prepare(context)
        if (intent == null) {
            call.resolve(JSObject().put("granted", true))
            return
        }
        // Capacitor 7 routes the consent-dialog result back via @ActivityCallback —
        // NOT the legacy Plugin.handleOnActivityResult (removed in Cap 5+). The old
        // activity.startActivityForResult + handleOnActivityResult never fired, so
        // the promise hung on the FIRST connect (consent needed); retries worked
        // because prepare() then returns null. startActivityForResult keeps the call.
        startActivityForResult(call, intent, "onVpnPrepareResult")
    }

    @ActivityCallback
    private fun onVpnPrepareResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        call.resolve(JSObject().put("granted", result.resultCode == Activity.RESULT_OK))
    }

    @PluginMethod
    fun connect(call: PluginCall) {
        val config = call.getString("config")
        if (config.isNullOrBlank()) {
            call.reject("connect requires 'config' (Clash YAML for mihomo)")
            return
        }
        pendingConfig = config
        pendingSelected = call.getString("selectedProxy")
        pendingSplitMode = call.getString("splitMode") ?: "off"
        pendingSplitApps = call.getArray("splitApps")?.let { arr ->
            (0 until arr.length()).mapNotNull { i -> try { arr.getString(i) } catch (_: Exception) { null } }
        } ?: emptyList()
        pendingKillSwitch = call.getBoolean("killSwitch") ?: SlaveVpnService.killSwitchEnabled
        SlaveVpnService.setKillSwitch(context, pendingKillSwitch)

        val intent = VpnService.prepare(context)
        if (intent != null) {
            // Need consent first — show the dialog; onVpnConnectResult resumes.
            startActivityForResult(call, intent, "onVpnConnectResult")
            return
        }
        startVpnService(call)
    }

    @ActivityCallback
    private fun onVpnConnectResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        if (result.resultCode == Activity.RESULT_OK) {
            startVpnService(call)
        } else {
            call.reject("VPN permission denied")
        }
    }

    private fun startVpnService(call: PluginCall) {
        val config = pendingConfig
        val selected = pendingSelected
        val splitMode = pendingSplitMode
        val splitApps = pendingSplitApps
        val killSwitch = pendingKillSwitch
        pendingConfig = null
        pendingSelected = null
        pendingSplitMode = "off"
        pendingSplitApps = emptyList()
        pendingKillSwitch = false
        if (config.isNullOrBlank()) {
            call.reject("Missing config when starting VPN")
            return
        }
        val serviceIntent = Intent(context, SlaveVpnService::class.java).apply {
            action = SlaveVpnService.ACTION_START
            putExtra(SlaveVpnService.EXTRA_CONFIG, config)
            if (!selected.isNullOrBlank()) putExtra(SlaveVpnService.EXTRA_SELECTED, selected)
            putExtra(SlaveVpnService.EXTRA_SPLIT_MODE, splitMode)
            if (splitApps.isNotEmpty()) putExtra(SlaveVpnService.EXTRA_SPLIT_APPS, splitApps.toTypedArray())
            putExtra(SlaveVpnService.EXTRA_KILL_SWITCH, if (killSwitch) "1" else "0")
        }
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent)
        } else {
            context.startService(serviceIntent)
        }
        // The app is foreground here (user just hit Connect) — the moment to
        // (1) request POST_NOTIFICATIONS so the foreground-service notification
        // (status + live speed + Reconnect/Disconnect) is actually shown; on
        // Android 13+ the notification is silently HIDDEN until this is granted,
        // which is why the shade looked empty. (2) offer the QS tile via the
        // system dialog, since MIUI won't list it in the edit tray on its own.
        maybeRequestNotificationPermission()
        maybePromptAddTile()
        call.resolve()
    }

    /**
     * Offer to add the SLAVE VPN Quick Settings tile via the system
     * requestAddTileService dialog (API 33+). Shown at most once per app session,
     * and never again once the tile is added/already present. Best-effort: any
     * failure is swallowed so it never blocks a connect.
     */
    private fun maybePromptAddTile() {
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.TIRAMISU) return
        if (tilePromptedThisSession) return
        val act = activity ?: return
        val prefs = act.getSharedPreferences("slavevpn_tile", android.content.Context.MODE_PRIVATE)
        if (prefs.getBoolean("added", false)) return
        tilePromptedThisSession = true
        try {
            val sbm = act.getSystemService(android.app.StatusBarManager::class.java) ?: return
            val icon = android.graphics.drawable.Icon.createWithResource(act, R.drawable.ic_tile_vpn)
            val component = android.content.ComponentName(act, SlaveVpnTileService::class.java)
            sbm.requestAddTileService(
                component,
                "SLAVE VPN",
                icon,
                { r -> act.runOnUiThread(r) },
                java.util.function.Consumer { result ->
                    if (result == android.app.StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_ADDED ||
                        result == android.app.StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_ALREADY_ADDED
                    ) {
                        prefs.edit().putBoolean("added", true).apply()
                    }
                },
            )
        } catch (_: Exception) { /* best-effort — never block connect */ }
    }

    /**
     * Ask for the POST_NOTIFICATIONS runtime permission (Android 13+). Without it
     * the system suppresses the VPN foreground-service notification entirely, so
     * the shade shows nothing — no status, no live speed, no Reconnect/Disconnect
     * actions. Best-effort and silent if already granted or pre-Tiramisu. The
     * grant result doesn't need a callback: once allowed, the next notify() (the
     * 2s speed tick) renders the notification.
     */
    private fun maybeRequestNotificationPermission() {
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.TIRAMISU) return
        val act = activity ?: return
        val granted = androidx.core.content.ContextCompat.checkSelfPermission(
            act, Manifest.permission.POST_NOTIFICATIONS,
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
        if (granted) return
        try {
            androidx.core.app.ActivityCompat.requestPermissions(
                act, arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQ_POST_NOTIFICATIONS,
            )
        } catch (_: Exception) { /* best-effort — never block connect */ }
    }

    @PluginMethod
    fun disconnect(call: PluginCall) {
        val serviceIntent = Intent(context, SlaveVpnService::class.java).apply {
            action = SlaveVpnService.ACTION_STOP
        }
        context.startService(serviceIntent)
        call.resolve()
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        val state = SlaveVpnService.currentState
        // Effective active server (leaf node) read from the mihomo SLAVE-SELECT
        // group, so the UI shows the REAL exit, not a stale model.
        val active = if (ClashBridge.isRunning()) ClashBridge.currentProxy() else ""
        val status = JSObject()
            .put("state", state)
            .put("mode", "bypass")
            .put("protocol", "")
            // Specific failure reason (null when none) so the UI can show WHY
            // a connection failed instead of a generic "Connection failed".
            .put("lastError", SlaveVpnService.currentError ?: JSObject.NULL)
            .put("activeProxy", if (active.isNotBlank()) active else JSObject.NULL)
        call.resolve(JSObject().put("status", status))
    }

    /**
     * Live-switch the active server in the mihomo SLAVE-SELECT group. New
     * connections egress through it. Persistence across reconnect is handled by
     * mihomo `store-selected` + the renderer re-applying the saved choice on
     * connect.
     */
    @PluginMethod
    fun selectProxy(call: PluginCall) {
        val name = call.getString("name") ?: return call.reject("name required")
        if (!ClashBridge.isRunning()) {
            // Not connected yet — the choice is persisted by the renderer and
            // applied on the next connect. Nothing to do live.
            call.resolve()
            return
        }
        try {
            ClashBridge.selectProxy(name)
            call.resolve()
        } catch (e: Exception) {
            call.reject("select proxy failed: ${e.message}")
        }
    }

    @PluginMethod
    fun getTraffic(call: PluginCall) {
        // Real live traffic from the mihomo statistic manager.
        val t = try { org.json.JSONObject(ClashBridge.getTraffic()) } catch (_: Exception) { org.json.JSONObject() }
        val up = t.optLong("up", 0)
        val down = t.optLong("down", 0)
        val upTotal = t.optLong("upTotal", 0)
        val downTotal = t.optLong("downTotal", 0)
        val traffic = JSObject()
            .put("uploadBytes", upTotal)
            .put("downloadBytes", downTotal)
            .put("uploadSpeedBps", up)
            .put("downloadSpeedBps", down)
            .put("sessionUploadBytes", upTotal)
            .put("sessionDownloadBytes", downTotal)
            .put("sessionStartedAt", JSObject.NULL)
        call.resolve(JSObject().put("traffic", traffic))
    }

    /** Active connections snapshot (clash-API JSON) for the dashboard. */
    @PluginMethod
    fun getConnections(call: PluginCall) {
        call.resolve(JSObject().put("snapshot", ClashBridge.getConnections()))
    }

    /** Close a single active connection by id («закрыть соединение»). */
    @PluginMethod
    fun closeConnection(call: PluginCall) {
        val id = call.getString("id")
        if (id.isNullOrBlank()) { call.reject("no id"); return }
        ClashBridge.closeConnection(id)
        call.resolve()
    }

    /** Close every active connection («закрыть все»). */
    @PluginMethod
    fun closeAllConnections(call: PluginCall) {
        ClashBridge.closeAllConnections()
        call.resolve()
    }

    /** Current rule-providers (bypass lists) status JSON, without refreshing. */
    @PluginMethod
    fun getRuleProviders(call: PluginCall) {
        val json = if (ClashBridge.isRunning()) ClashBridge.getRuleProviders() else "[]"
        call.resolve(JSObject().put("providers", json))
    }

    /**
     * «Обновить списки» — force-refresh every bypass rule-provider NOW and return
     * the resulting status JSON. No-op (empty) when the core isn't running.
     */
    @PluginMethod
    fun updateRuleProviders(call: PluginCall) {
        if (!ClashBridge.isRunning()) {
            call.reject("VPN не запущен — списки обновляются у работающего ядра")
            return
        }
        val json = ClashBridge.updateRuleProviders()
        call.resolve(JSObject().put("providers", json))
    }

    /** Latency (ms) of a proxy via URL test; -1 on error. */
    @PluginMethod
    fun testDelay(call: PluginCall) {
        val name = call.getString("name") ?: return call.reject("name required")
        val url = call.getString("url") ?: "https://www.gstatic.com/generate_204"
        val timeout = call.getInt("timeout") ?: 5000
        if (!ClashBridge.isRunning()) { call.resolve(JSObject().put("delay", -1)); return }
        val delay = ClashBridge.testDelay(name, url, timeout)
        call.resolve(JSObject().put("delay", delay))
    }

    @PluginMethod
    fun setMode(call: PluginCall) {
        val mode = call.getString("mode") ?: return call.reject("mode required")
        SlaveVpnService.setMode(mode)
        call.resolve()
    }

    @PluginMethod
    fun setEngine(call: PluginCall) {
        val engine = call.getString("engine") ?: return call.reject("engine required")
        SlaveVpnService.setEngine(engine)
        call.resolve()
    }

    /**
     * Live-toggle the kill switch. Takes effect on the next VPN drop (core-start
     * failure or reconnect) — the running service reads killSwitchEnabled at drop
     * time, so flipping it while connected is honoured without a reconnect.
     */
    @PluginMethod
    fun setKillSwitch(call: PluginCall) {
        val enabled = call.getBoolean("enabled") ?: false
        SlaveVpnService.setKillSwitch(context, enabled)
        call.resolve()
    }

    /**
     * Open the system VPN settings so the user can enable "Always-on VPN" +
     * "Block connections without VPN" (OS-enforced lockdown) for us. Android
     * forbids an app from turning lockdown on programmatically — this is the
     * strongest kill switch and it's enforced even when our process is dead.
     */
    @PluginMethod
    fun openAlwaysOnVpnSettings(call: PluginCall) {
        try {
            // Settings.ACTION_VPN_SETTINGS is API 24; use the literal so lintVital
            // (minSdk 21) doesn't flag it. The string works on all levels; a device
            // without the screen throws ActivityNotFound → caught below.
            val intent = Intent("android.settings.VPN_SETTINGS")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            call.reject("Cannot open VPN settings: ${e.message}")
        }
    }

    /**
     * Persist the «Подключаться при включении телефона» flag into native prefs so
     * the BootReceiver can read it at boot (the WebView isn't running then).
     */
    @PluginMethod
    fun setConnectOnBoot(call: PluginCall) {
        val enabled = call.getBoolean("enabled") ?: false
        SlaveVpnService.setConnectOnBoot(context, enabled)
        call.resolve()
    }

    /**
     * Ask the OS to exempt us from battery optimization (Doze/app-standby) so
     * aggressive OEM killers (Xiaomi/Samsung) don't murder the VPN in the
     * background. We're sideloaded, so the Play policy on this intent doesn't
     * apply. Opens the per-app request dialog; falls back to the general battery
     * settings screen if unavailable.
     */
    @PluginMethod
    fun requestIgnoreBatteryOptimizations(call: PluginCall) {
        try {
            val pm = context.getSystemService(Context.POWER_SERVICE) as? android.os.PowerManager
            val alreadyExempt = pm?.isIgnoringBatteryOptimizations(context.packageName) == true
            val action = if (alreadyExempt) {
                // Already exempt → just show where the setting lives.
                "android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS"
            } else {
                "android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS"
            }
            val intent = Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            if (!alreadyExempt) intent.data = Uri.parse("package:${context.packageName}")
            context.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            try {
                context.startActivity(
                    Intent("android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS")
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                )
                call.resolve()
            } catch (e2: Exception) {
                call.reject("Cannot open battery settings: ${e2.message}")
            }
        }
    }

    // ─── Subscriptions — TODO Phase I-B ───────────────────────────────────────
    // Port apps/windows/src/main/services/SubscriptionStore.ts to Kotlin
    // using EncryptedSharedPreferences.

    @PluginMethod
    fun listSubscriptions(call: PluginCall) {
        // TODO
        call.resolve(JSObject().put("entries", org.json.JSONArray()))
    }

    @PluginMethod
    fun addSubscription(call: PluginCall) {
        call.reject("Not yet implemented")
    }

    @PluginMethod
    fun removeSubscription(call: PluginCall) {
        call.reject("Not yet implemented")
    }

    @PluginMethod
    fun refreshSubscription(call: PluginCall) {
        call.reject("Not yet implemented")
    }

    /**
     * Lets the renderer push a diagnostic line into the in-app Logs ring buffer
     * (Диагностика→Логи). Used to make the UI→store→bridge chain observable on
     * device (e.g. confirm a server tap actually reached bridge.setProxy).
     */
    @PluginMethod
    fun appendLog(call: PluginCall) {
        val line = call.getString("line")
        if (!line.isNullOrBlank()) SlaveVpnService.appendLog(line)
        call.resolve()
    }

    /**
     * List installed apps that hold INTERNET permission (the only ones whose
     * traffic the VPN routes) for the per-app split-tunnel picker. Returns
     * [{packageName, label, system}]. Our own package is omitted.
     */
    @PluginMethod
    fun listApps(call: PluginCall) {
        val pm = context.packageManager
        val apps = org.json.JSONArray()
        try {
            // Android 11+ hides arbitrary installed packages. Query launchable
            // applications instead of requesting the privacy-sensitive
            // QUERY_ALL_PACKAGES permission; those are the apps a user can
            // meaningfully select in the split-tunnel UI.
            val launcherIntent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
            val seen = mutableSetOf<String>()
            for (resolved in pm.queryIntentActivities(launcherIntent, android.content.pm.PackageManager.MATCH_ALL)) {
                val ai = resolved.activityInfo?.applicationInfo ?: continue
                if (!seen.add(ai.packageName)) continue
                if (ai.packageName == context.packageName) continue
                val hasInternet = pm.checkPermission(Manifest.permission.INTERNET, ai.packageName) ==
                    android.content.pm.PackageManager.PERMISSION_GRANTED
                if (!hasInternet) continue
                val isSystem = (ai.flags and android.content.pm.ApplicationInfo.FLAG_SYSTEM) != 0
                val label = try { pm.getApplicationLabel(ai).toString() } catch (_: Exception) { ai.packageName }
                apps.put(
                    JSObject()
                        .put("packageName", ai.packageName)
                        .put("label", label)
                        .put("system", isSystem)
                        .put("icon", appIconBase64(ai)),
                )
            }
        } catch (e: Exception) {
            call.reject("listApps failed: ${e.message}")
            return
        }
        call.resolve(JSObject().put("apps", apps))
    }

    /**
     * The app's launcher icon as a small `data:image/png;base64,...` string for the
     * split-tunnel picker. Downscaled to 48px so the (potentially 100+) icons stay a
     * lean payload. Returns "" on any failure so the row just shows no icon.
     */
    private fun appIconBase64(ai: android.content.pm.ApplicationInfo): String {
        return try {
            val d = context.packageManager.getApplicationIcon(ai)
            val size = 48
            val bmp = android.graphics.Bitmap.createBitmap(size, size, android.graphics.Bitmap.Config.ARGB_8888)
            val canvas = android.graphics.Canvas(bmp)
            d.setBounds(0, 0, size, size)
            d.draw(canvas)
            val out = java.io.ByteArrayOutputStream()
            bmp.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, out)
            bmp.recycle()
            "data:image/png;base64," + android.util.Base64.encodeToString(out.toByteArray(), android.util.Base64.NO_WRAP)
        } catch (_: Exception) { "" }
    }

    @PluginMethod
    fun getLogs(call: PluginCall) {
        // Real Mihomo + lifecycle logs from the in-memory ring buffer fed by
        // ClashBridge and SlaveVpnService.
        val tail = call.getInt("tail") ?: 500
        val lines = org.json.JSONArray()
        for (line in SlaveVpnService.recentLogs(tail)) lines.put(line)
        call.resolve(JSObject().put("lines", lines))
    }

    // ─── In-app update: download the APK and launch the system installer ────────
    // Downloads the release APK inside the app (emitting `updateProgress` events)
    // and hands it to the platform PackageInstaller. Android still shows its
    // mandatory "Install?" confirm sheet and needs the one-time "install unknown
    // apps" grant — that is OS security and cannot be bypassed for a sideloaded
    // APK — but there is NO browser hop: the download runs here with a progress
    // bar and the system install sheet then appears directly.
    @PluginMethod
    fun downloadAndInstallUpdate(call: PluginCall) {
        val url = call.getString("url")
        if (url.isNullOrBlank()) { call.reject("no url"); return }

        // Android O+: needs the user's "install unknown apps" grant. If missing,
        // open that settings screen and ask the JS layer to retry afterwards.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !context.packageManager.canRequestPackageInstalls()) {
            try {
                context.startActivity(
                    Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:${context.packageName}"),
                    ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                )
            } catch (_: Exception) { }
            call.reject("NEEDS_INSTALL_PERMISSION")
            return
        }

        // Use the system DownloadManager so the download SURVIVES the app being
        // backgrounded/minimized (the reported bug: a plain in-process thread gets
        // frozen by the OS when the app leaves the foreground). DownloadManager runs
        // the transfer in the system process and follows the GitHub→CDN redirects
        // itself. Destination = app-specific external dir (no storage permission).
        val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val dest = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "slavevpn-update.apk")
        try { dest.delete() } catch (_: Exception) { } // no accumulation — one file, replaced
        val downloadId = try {
            dm.enqueue(
                DownloadManager.Request(Uri.parse(url))
                    .setTitle("SLAVE VPN — обновление")
                    .setDescription("Загрузка новой версии")
                    .setMimeType("application/vnd.android.package-archive")
                    .setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, "slavevpn-update.apk")
                    .setAllowedOverMetered(true)
                    .setAllowedOverRoaming(true),
            )
        } catch (e: Exception) { call.reject(e.message ?: "download failed"); return }

        // Poll progress + completion. The transfer keeps running while backgrounded;
        // our poll thread may be frozen then, but on resume it catches up and installs
        // in the foreground (a background startActivity for the install sheet is blocked).
        Thread {
            while (true) {
                var status = -1
                var done = 0L
                var total = -1L
                val cursor = dm.query(DownloadManager.Query().setFilterById(downloadId))
                cursor?.use {
                    if (it.moveToFirst()) {
                        status = it.getInt(it.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
                        done = it.getLong(it.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
                        total = it.getLong(it.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
                    }
                }
                when (status) {
                    DownloadManager.STATUS_SUCCESSFUL -> {
                        notifyListeners("updateProgress", JSObject().put("percent", 100))
                        Handler(Looper.getMainLooper()).post {
                            try { installApk(dest); call.resolve() }
                            catch (e: Exception) { call.reject(e.message ?: "install failed") }
                        }
                        return@Thread
                    }
                    DownloadManager.STATUS_FAILED, -1 -> { call.reject("download failed"); return@Thread }
                    else -> if (total > 0) {
                        notifyListeners("updateProgress", JSObject().put("percent", ((done * 100) / total).toInt()))
                    }
                }
                try { Thread.sleep(500) } catch (_: InterruptedException) { return@Thread }
            }
        }.start()
    }

    private fun installApk(apk: File) {
        val pkg = context.packageName
        val installer = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
        val sessionId = installer.createSession(params)
        installer.openSession(sessionId).use { session ->
            session.openWrite("pkg", 0, apk.length()).use { out ->
                apk.inputStream().use { it.copyTo(out) }
                session.fsync(out)
            }
            val action = "$pkg.APK_INSTALL_STATUS"
            // Dynamically-registered (not exported) receiver: when the installer
            // reports STATUS_PENDING_USER_ACTION it hands back the confirm Intent we
            // must launch to show the system "Install?" sheet. No manifest provider
            // needed (PackageInstaller streams the bytes; no FileProvider/file://).
            val receiver = object : BroadcastReceiver() {
                override fun onReceive(c: Context, i: Intent) {
                    val status = i.getIntExtra(PackageInstaller.EXTRA_STATUS, Int.MIN_VALUE)
                    if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                        @Suppress("DEPRECATION")
                        val confirm = i.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                        confirm?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        try { context.startActivity(confirm) } catch (_: Exception) { }
                    } else {
                        try { c.unregisterReceiver(this) } catch (_: Exception) { }
                    }
                }
            }
            ContextCompat.registerReceiver(
                context, receiver, IntentFilter(action),
                ContextCompat.RECEIVER_NOT_EXPORTED,
            )
            val pi = PendingIntent.getBroadcast(
                context, sessionId, Intent(action).setPackage(pkg),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
            )
            session.commit(pi.intentSender)
        }
    }
}
