/*
 * SlaveVpnService — Android VpnService that hands TUN fd to libbox
 * (sing-box mobile). Phase K.5 — real engine integration.
 *
 * Lifecycle:
 *   onStartCommand(ACTION_START, config) → establish TUN → SingboxBridge.start()
 *   onStartCommand(ACTION_STOP)          → SingboxBridge.stop() → close TUN
 *
 * Config JSON is passed via Intent extra "config". The Capacitor plugin
 * generates it from the user's subscription + scenarios using shared
 * @slave-vpn/config code (renderer side, via SingboxConfigCompiler).
 */

package com.slavevpn.plugin

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import androidx.core.app.NotificationCompat
import com.slavevpn.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class SlaveVpnService : VpnService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var tunInterface: ParcelFileDescriptor? = null
    private var libboxJob: Job? = null
    var tunFd: Int = -1
        private set

    companion object {
        const val ACTION_START = "com.slavevpn.START"
        const val ACTION_STOP  = "com.slavevpn.STOP"
        const val EXTRA_CONFIG = "config"
        const val CHANNEL_ID   = "slavevpn_persistent"
        const val NOTIF_ID     = 100

        @JvmStatic var currentState: String = "disconnected"
            private set

        private var currentMode: String = "bypass"
        private var currentEngine: String = "singbox"

        @JvmStatic fun setMode(mode: String) { currentMode = mode }
        @JvmStatic fun setEngine(engine: String) { currentEngine = engine }
    }

    override fun onCreate() {
        super.onCreate()
        // Initialise libbox once per process; safe to call multiple times
        try {
            SingboxBridge.setup(
                basePath = filesDir.absolutePath,
                workingPath = filesDir.absolutePath,
                tempPath = cacheDir.absolutePath,
            )
        } catch (e: Exception) {
            android.util.Log.e("SlaveVpnService", "libbox setup failed", e)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                val config = intent.getStringExtra(EXTRA_CONFIG)
                if (config.isNullOrBlank()) {
                    android.util.Log.e("SlaveVpnService", "ACTION_START without config extra")
                    currentState = "error"
                    stopSelf()
                    return START_NOT_STICKY
                }
                startVpn(config)
            }
            ACTION_STOP -> stopVpn()
        }
        return START_STICKY
    }

    private fun startVpn(configJson: String) {
        if (currentState == "connected" || currentState == "connecting") return
        currentState = "connecting"

        startForeground(NOTIF_ID, buildNotification("Подключение..."))

        try {
            val builder = Builder()
                .setSession("SLAVE VPN")
                .addAddress("172.19.0.1", 30)
                .addAddress("fdfe:dcba:9876::1", 126)
                .addRoute("0.0.0.0", 0)
                .addRoute("::", 0)
                .addDnsServer("8.8.8.8")
                .addDnsServer("1.1.1.1")
                .setMtu(9000)
                .setBlocking(true)

            // TODO: per-app routing for currentMode == "split"
            //   builder.addDisallowedApplication(...)

            val pfd = builder.establish()
                ?: throw RuntimeException("VpnService.Builder.establish() returned null")
            tunInterface = pfd
            tunFd = pfd.fd
            android.util.Log.i("SlaveVpnService", "TUN established, fd=$tunFd")

            // Hand TUN fd + config to libbox on a worker coroutine
            libboxJob = scope.launch {
                try {
                    val platform = SlavePlatformInterface(this@SlaveVpnService)
                    SingboxBridge.start(configJson, platform)
                    currentState = "connected"
                    notify("Подключено · sing-box ${SingboxBridge.version()}")
                } catch (e: Exception) {
                    android.util.Log.e("SlaveVpnService", "libbox start failed", e)
                    currentState = "error"
                    notify("Ошибка: ${e.message}")
                    cleanupTun()
                    stopSelf()
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("SlaveVpnService", "VPN setup failed", e)
            currentState = "error"
            notify("Ошибка: ${e.message}")
            cleanupTun()
            stopSelf()
        }
    }

    private fun stopVpn() {
        scope.launch {
            try { SingboxBridge.stop() } catch (_: Exception) { }
        }
        libboxJob?.cancel()
        libboxJob = null
        cleanupTun()
        currentState = "disconnected"
        notify("Отключено")
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    /**
     * libbox takes ownership of the TUN fd after openTun() — we set
     * tunInterface to null so we don't double-close on stop().
     */
    fun releaseTunOwnership() {
        // Keep the ParcelFileDescriptor reference alive but don't close it ourselves.
        // We do NOT detachFd() here because libbox dup()s it internally.
    }

    private fun cleanupTun() {
        try { tunInterface?.close() } catch (_: Exception) { }
        tunInterface = null
        tunFd = -1
    }

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
        try { SingboxBridge.stop() } catch (_: Exception) { }
        cleanupTun()
    }

    override fun onRevoke() {
        // System or user revoked VPN — sing-box must stop cleanly
        try { SingboxBridge.stop() } catch (_: Exception) { }
        cleanupTun()
        stopSelf()
        super.onRevoke()
    }

    // ─── Notification ─────────────────────────────────────────────────────────

    private fun buildNotification(text: String): Notification {
        ensureChannel()
        val intent = Intent(this, MainActivity::class.java)
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
            PendingIntent.FLAG_IMMUTABLE else 0
        val pi = PendingIntent.getActivity(this, 0, intent, flags)

        val stopIntent = Intent(this, SlaveVpnService::class.java).apply { action = ACTION_STOP }
        val stopPi = PendingIntent.getService(this, 1, stopIntent, flags)

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("SLAVE VPN")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setContentIntent(pi)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Отключить", stopPi)
            .build()
    }

    private fun notify(text: String) {
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIF_ID, buildNotification(text))
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            CHANNEL_ID, "SLAVE VPN", NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Active VPN connection"
            setShowBadge(false)
        }
        nm.createNotificationChannel(channel)
    }
}
