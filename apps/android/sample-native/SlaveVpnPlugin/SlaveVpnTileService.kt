/*
 * SlaveVpnTileService — Quick Settings tile (notification shade) that toggles
 * the VPN without opening the app.
 *
 *   tap while connected/connecting → ACTION_STOP (no config needed)
 *   tap while disconnected         → start with the last cached config
 *                                    (SlaveVpnService.readCachedConfig); if no
 *                                    cache exists or VPN consent isn't granted
 *                                    yet, open the app so the renderer connects.
 *
 * The tile label/state is refreshed from SlaveVpnService.currentState on
 * onStartListening and whenever the service calls requestTileUpdate(...).
 */

package com.slavevpn.plugin

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

class SlaveVpnTileService : TileService() {

    override fun onStartListening() {
        super.onStartListening()
        refreshTile()
    }

    override fun onClick() {
        super.onClick()
        when (SlaveVpnService.currentState) {
            "connected", "connecting" -> {
                // Disconnect — config not required.
                val stop = Intent(this, SlaveVpnService::class.java)
                    .apply { action = SlaveVpnService.ACTION_STOP }
                startService(stop)
            }
            else -> connectFromCacheOrOpenApp()
        }
        refreshTile() // optimistic; the service pings a definitive update shortly
    }

    private fun connectFromCacheOrOpenApp() {
        val cached = SlaveVpnService.readCachedConfig(this)
        // No previously-connected config, or VPN consent not yet granted →
        // the system consent dialog needs an Activity, so open the app.
        if (cached == null || VpnService.prepare(this) != null) {
            openApp()
            return
        }
        val start = Intent(this, SlaveVpnService::class.java).apply {
            action = SlaveVpnService.ACTION_START
            putExtra(SlaveVpnService.EXTRA_CONFIG, cached.config)
            putExtra(SlaveVpnService.EXTRA_SELECTED, cached.selected)
            putExtra(SlaveVpnService.EXTRA_SPLIT_MODE, cached.splitMode)
            putExtra(SlaveVpnService.EXTRA_SPLIT_APPS, cached.splitApps.toTypedArray())
            putExtra(SlaveVpnService.EXTRA_KILL_SWITCH, if (cached.killSwitch) "1" else "0")
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(start)
        else startService(start)
    }

    @SuppressLint("StartActivityAndCollapseDeprecated")
    private fun openApp() {
        val launch = packageManager.getLaunchIntentForPackage(packageName)
            ?.apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) } ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            // API 34 deprecated the Intent overload in favour of a PendingIntent.
            val pi = PendingIntent.getActivity(
                this, 0, launch,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            startActivityAndCollapse(pi)
        } else {
            @Suppress("DEPRECATION")
            startActivityAndCollapse(launch)
        }
    }

    private fun refreshTile() {
        val tile = qsTile ?: return
        when (SlaveVpnService.currentState) {
            "connected" -> { tile.state = Tile.STATE_ACTIVE; tile.subtitleCompat("Подключено") }
            "connecting" -> { tile.state = Tile.STATE_ACTIVE; tile.subtitleCompat("Подключение…") }
            else -> { tile.state = Tile.STATE_INACTIVE; tile.subtitleCompat("Отключено") }
        }
        tile.label = "SLAVE VPN"
        tile.updateTile()
    }

    // Tile.setSubtitle is API 29+; no-op on older versions.
    private fun Tile.subtitleCompat(text: String) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) subtitle = text
    }
}
