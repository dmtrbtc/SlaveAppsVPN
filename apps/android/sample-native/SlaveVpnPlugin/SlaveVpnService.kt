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
import com.slavevpn.app.MainActivity
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

        // Last specific failure reason — surfaced to the renderer via getStatus
        // so the UI can show WHY a connection failed instead of a generic
        // "Connection failed". Cleared when a fresh connect attempt begins.
        @JvmStatic @Volatile var currentError: String? = null
            private set

        private var currentMode: String = "bypass"
        private var currentEngine: String = "singbox"

        @JvmStatic fun setMode(mode: String) { currentMode = mode }
        @JvmStatic fun setEngine(engine: String) { currentEngine = engine }

        // ─── In-memory log ring buffer ──────────────────────────────────────
        // libbox writeLog() + our own lifecycle lines land here so the in-app
        // Logs panel (diagnostics.getLogs) shows REAL engine output, not an
        // empty TODO stub. Capped to avoid unbounded growth.
        private const val LOG_CAP = 600
        private val logRing = ArrayDeque<String>(LOG_CAP)

        @JvmStatic fun appendLog(line: String) {
            if (line.isBlank()) return
            synchronized(logRing) {
                if (logRing.size >= LOG_CAP) logRing.removeFirst()
                logRing.addLast(line)
            }
        }

        @JvmStatic fun recentLogs(tail: Int): List<String> {
            synchronized(logRing) {
                if (tail <= 0 || tail >= logRing.size) return logRing.toList()
                return logRing.toList().takeLast(tail)
            }
        }
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
                    val msg = "ACTION_START without config extra"
                    android.util.Log.e("SlaveVpnService", msg)
                    currentState = "error"
                    currentError = msg
                    appendLog("[service] $msg")
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
        currentError = null  // fresh attempt — clear any prior failure reason
        appendLog("[service] starting VPN")

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
            appendLog("[service] TUN established, fd=$tunFd")

            // Hand TUN fd + config to libbox on a worker coroutine
            libboxJob = scope.launch {
                try {
                    val platform = SlavePlatformInterface(this@SlaveVpnService)
                    SingboxBridge.start(configJson, platform)
                    currentState = "connected"
                    currentError = null
                    appendLog("[service] connected · sing-box ${SingboxBridge.version()}")
                    notify("Подключено · sing-box ${SingboxBridge.version()}")
                } catch (e: Exception) {
                    val msg = e.message ?: e.javaClass.simpleName
                    android.util.Log.e("SlaveVpnService", "libbox start failed", e)
                    currentState = "error"
                    currentError = "libbox: $msg"
                    appendLog("[service] libbox start failed: $msg")
                    notify("Ошибка: $msg")
                    cleanupTun()
                    stopSelf()
                }
            }
        } catch (e: Exception) {
            val msg = e.message ?: e.javaClass.simpleName
            android.util.Log.e("SlaveVpnService", "VPN setup failed", e)
            currentState = "error"
            currentError = "tun: $msg"
            appendLog("[service] VPN setup failed: $msg")
            notify("Ошибка: $msg")
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
