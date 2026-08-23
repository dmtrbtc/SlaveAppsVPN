/*
 * BootReceiver — auto-connect the VPN after a device restart.
 *
 * Fires on ACTION_BOOT_COMPLETED (declared in the CI-patched manifest, guarded
 * by RECEIVE_BOOT_COMPLETED). It reads the native connect_on_boot flag +
 * last-connected config directly from SharedPreferences — the WebView/renderer
 * is NOT running at boot, so everything the decision needs lives in native prefs
 * (SlaveVpnService companion helpers) that the QS tile already relies on.
 *
 * Silent no-op unless ALL hold:
 *   - connect_on_boot is ON,
 *   - a previously-connected config is cached (never connected → nothing to do),
 *   - VPN consent is already granted (VpnService.prepare == null; the OS consent
 *     dialog needs an Activity we can't show from a boot receiver).
 */

package com.slavevpn.plugin

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.os.Build

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        try {
            if (!SlaveVpnService.connectOnBootEnabled(context)) return
            val cached = SlaveVpnService.readCachedConfig(context) ?: return
            // Consent already granted? (prepare returns null when it is.) Without
            // it we can't start the tunnel from a receiver — bail quietly.
            if (VpnService.prepare(context) != null) return

            val start = Intent(context, SlaveVpnService::class.java).apply {
                action = SlaveVpnService.ACTION_START
                putExtra(SlaveVpnService.EXTRA_CONFIG, cached.config)
                putExtra(SlaveVpnService.EXTRA_SELECTED, cached.selected)
                putExtra(SlaveVpnService.EXTRA_SPLIT_MODE, cached.splitMode)
                putExtra(SlaveVpnService.EXTRA_SPLIT_APPS, cached.splitApps.toTypedArray())
                putExtra(SlaveVpnService.EXTRA_KILL_SWITCH, if (cached.killSwitch) "1" else "0")
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(start)
            } else {
                context.startService(start)
            }
            SlaveVpnService.appendLog("[boot] auto-connect on device start")
        } catch (_: Exception) {
            // Never crash the boot broadcast.
        }
    }
}
