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

    private var pendingConnectCall: PluginCall? = null

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
        // Persist the call so we can resolve it after onActivityResult
        bridge.saveCall(call)
        activity.startActivityForResult(intent, REQ_VPN_PREPARE)
    }

    override fun handleOnActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.handleOnActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_VPN_PREPARE) return

        val saved = bridge.savedCall ?: return
        val granted = resultCode == android.app.Activity.RESULT_OK
        saved.resolve(JSObject().put("granted", granted))
        bridge.releaseCall(saved)

        // If user granted and a connect was pending, kick off the service
        pendingConnectCall?.let { connectCall ->
            if (granted) {
                startVpnService(connectCall)
            } else {
                connectCall.reject("VPN permission denied")
                pendingConnectCall = null
            }
        }
    }

    private var pendingConfig: String? = null

    @PluginMethod
    fun connect(call: PluginCall) {
        val config = call.getString("config")
        if (config.isNullOrBlank()) {
            call.reject("connect requires 'config' (sing-box JSON)")
            return
        }
        pendingConfig = config

        val intent = VpnService.prepare(context)
        if (intent != null) {
            // Need consent first — request, then resume connect on success
            pendingConnectCall = call
            bridge.saveCall(call)
            activity.startActivityForResult(intent, REQ_VPN_PREPARE)
            return
        }
        startVpnService(call)
    }

    private fun startVpnService(call: PluginCall) {
        val config = pendingConfig
        pendingConfig = null
        if (config.isNullOrBlank()) {
            call.reject("Missing config when starting VPN")
            return
        }
        val serviceIntent = Intent(context, SlaveVpnService::class.java).apply {
            action = SlaveVpnService.ACTION_START
            putExtra(SlaveVpnService.EXTRA_CONFIG, config)
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
        val status = JSObject()
            .put("state", state)
            .put("mode", "bypass")
            .put("protocol", "")
        call.resolve(JSObject().put("status", status))
    }

    @PluginMethod
    fun getTraffic(call: PluginCall) {
        // TODO: pipe from engine in Phase I-D
        val traffic = JSObject()
            .put("uploadBytes", 0)
            .put("downloadBytes", 0)
            .put("uploadSpeedBps", 0)
            .put("downloadSpeedBps", 0)
            .put("sessionUploadBytes", 0)
            .put("sessionDownloadBytes", 0)
            .put("sessionStartedAt", JSObject.NULL)
        call.resolve(JSObject().put("traffic", traffic))
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

    @PluginMethod
    fun getLogs(call: PluginCall) {
        // TODO: tail logcat for our service
        call.resolve(JSObject().put("lines", org.json.JSONArray()))
    }
}
