/*
 * SAMPLE — not wired into a real Android project yet.
 *
 * Copy this file into android/app/src/main/java/com/slavevpn/plugin/ after
 * running `pnpm cap add android`. Then add to MainActivity's plugin list:
 *   registerPlugin(SlaveVpnPlugin::class.java)
 *
 * This file shows the minimum surface needed for Phase I-C (basic
 * VpnService that establishes a TUN but doesn't route real traffic).
 *
 * Real engine integration (mihomo / sing-box .so libraries) comes later
 * in Phase I-D. See docs/ANDROID.md for the full roadmap.
 */

package com.slavevpn.plugin

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.net.VpnService
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission

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
        pendingConfig = null
        pendingSelected = null
        pendingSplitMode = "off"
        pendingSplitApps = emptyList()
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
            val iconId = act.resources.getIdentifier("ic_tile_vpn", "drawable", act.packageName)
            if (iconId == 0) return
            val icon = android.graphics.drawable.Icon.createWithResource(act, iconId)
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
            for (ai in pm.getInstalledApplications(android.content.pm.PackageManager.GET_META_DATA)) {
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
                        .put("system", isSystem),
                )
            }
        } catch (e: Exception) {
            call.reject("listApps failed: ${e.message}")
            return
        }
        call.resolve(JSObject().put("apps", apps))
    }

    @PluginMethod
    fun getLogs(call: PluginCall) {
        // Real engine + lifecycle logs from the in-memory ring buffer that
        // libbox writeLog() and SlaveVpnService feed. No longer a stub.
        val tail = call.getInt("tail") ?: 500
        val lines = org.json.JSONArray()
        for (line in SlaveVpnService.recentLogs(tail)) lines.put(line)
        call.resolve(JSObject().put("lines", lines))
    }
}
