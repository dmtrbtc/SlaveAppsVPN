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
import android.content.Intent
import android.net.VpnService
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
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

    companion object {
        private const val REQ_VPN_PREPARE = 0x5AFE
    }

    // Pending calls awaiting the VpnService.prepare() consent dialog result.
    // We track them in member fields (NOT bridge.savedCall, which has no
    // public no-arg accessor in Capacitor 7 — savedCalls is a private Map).
    private var pendingPermissionCall: PluginCall? = null
    private var pendingConnectCall: PluginCall? = null
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
        // Persist the call so it survives the activity-result round-trip.
        call.setKeepAlive(true)
        pendingPermissionCall = call
        activity.startActivityForResult(intent, REQ_VPN_PREPARE)
    }

    override fun handleOnActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.handleOnActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_VPN_PREPARE) return

        val granted = resultCode == android.app.Activity.RESULT_OK

        // Resolve a standalone requestPermission() call, if any.
        pendingPermissionCall?.let { permCall ->
            permCall.resolve(JSObject().put("granted", granted))
            permCall.setKeepAlive(false)
            pendingPermissionCall = null
        }

        // If a connect() was waiting on consent, resume or fail it.
        pendingConnectCall?.let { connectCall ->
            if (granted) {
                startVpnService(connectCall)
            } else {
                connectCall.reject("VPN permission denied")
            }
            connectCall.setKeepAlive(false)
            pendingConnectCall = null
        }
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
            // Need consent first — request, then resume connect on success
            call.setKeepAlive(true)
            pendingConnectCall = call
            activity.startActivityForResult(intent, REQ_VPN_PREPARE)
            return
        }
        startVpnService(call)
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
        call.resolve()
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
