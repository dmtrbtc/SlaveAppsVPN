/*
 * SlaveVpnService — Android VpnService that drives the mihomo (Clash.Meta)
 * core via the gomobile clashbox bridge. mihomo supports VLESS Encryption
 * (ML-KEM-768 / X25519); the previous sing-box libbox engine did not.
 *
 * Lifecycle:
 *   onStartCommand(ACTION_START, config) → establish TUN → ClashBridge.start()
 *   onStartCommand(ACTION_STOP)          → ClashBridge.stop() → close TUN
 *
 * The config is a Clash YAML produced by the SHARED @slave-vpn/config
 * generateMihomoConfig (same builder Windows uses — so enc nodes are NOT
 * skipped). The VpnService TUN file descriptor is handed to the core via the
 * clash `tun.file-descriptor` field, injected here once we have the fd.
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
    private var coreJob: Job? = null

    companion object {
        const val ACTION_START = "com.slavevpn.START"
        const val ACTION_STOP  = "com.slavevpn.STOP"
        const val EXTRA_CONFIG = "config"
        const val EXTRA_SELECTED = "selectedProxy"
        const val CHANNEL_ID   = "slavevpn_persistent"
        const val NOTIF_ID     = 100
        const val TUN_MTU      = 9000

        @JvmStatic var currentState: String = "disconnected"
            private set

        // Last specific failure reason — surfaced to the renderer via getStatus
        // so the UI can show WHY a connection failed instead of a generic
        // "Connection failed". Cleared when a fresh connect attempt begins.
        @JvmStatic @Volatile var currentError: String? = null
            private set

        private var currentMode: String = "bypass"
        private var currentEngine: String = "mihomo"

        @JvmStatic fun setMode(mode: String) { currentMode = mode }
        @JvmStatic fun setEngine(engine: String) { currentEngine = engine }

        // ─── In-memory log ring buffer ──────────────────────────────────────
        // mihomo core logs + our own lifecycle lines land here so the in-app
        // Logs panel (diagnostics.getLogs) shows REAL engine output. Capped.
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
        // Initialise the mihomo core home dir once per process.
        try {
            ClashBridge.setup(filesDir.absolutePath)
        } catch (e: Exception) {
            android.util.Log.e("SlaveVpnService", "mihomo setup failed", e)
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
                startVpn(config, intent.getStringExtra(EXTRA_SELECTED))
            }
            ACTION_STOP -> stopVpn()
        }
        return START_STICKY
    }

    private fun startVpn(configYaml: String, selectedProxy: String?) {
        if (currentState == "connected" || currentState == "connecting") return
        currentState = "connecting"
        currentError = null  // fresh attempt — clear any prior failure reason
        appendLog("[service] starting VPN (mihomo)")

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
                .setMtu(TUN_MTU)
                .setBlocking(true)

            // TODO: per-app routing for currentMode == "split"
            //   builder.addDisallowedApplication(...)

            val pfd = builder.establish()
                ?: throw RuntimeException("VpnService.Builder.establish() returned null")
            tunInterface = pfd

            // mihomo's sing-tun wraps the fd DIRECTLY (os.NewFile, no dup) and
            // closes it on Shutdown. Give it a DUP'd fd it owns exclusively, and
            // keep the original ParcelFileDescriptor for ourselves — avoids a
            // double-close of the same descriptor on stop.
            val coreFd = ParcelFileDescriptor.dup(pfd.fileDescriptor).detachFd()
            android.util.Log.i("SlaveVpnService", "TUN established, coreFd=$coreFd")
            appendLog("[service] TUN established, fd=$coreFd")

            val config = injectTunFd(configYaml, coreFd)

            coreJob = scope.launch {
                try {
                    ClashBridge.start(
                        configYaml = config,
                        protect = { fd -> protect(fd) },
                        onLog = { level, message -> appendLog("[$level] $message") },
                    )
                    // Apply the user's persisted server choice now that the
                    // SLAVE-SELECT group exists — otherwise mihomo defaults to
                    // SLAVE-AUTO (url-test) and ignores the selection.
                    if (!selectedProxy.isNullOrBlank()) {
                        try {
                            ClashBridge.selectProxy(selectedProxy)
                            appendLog("[service] selected proxy: $selectedProxy")
                        } catch (e: Exception) {
                            appendLog("[service] select proxy failed: ${e.message}")
                        }
                    }
                    currentState = "connected"
                    currentError = null
                    appendLog("[service] connected · mihomo ${ClashBridge.version()}")
                    notify("Подключено · mihomo ${ClashBridge.version()}")
                } catch (e: Exception) {
                    val msg = e.message ?: e.javaClass.simpleName
                    android.util.Log.e("SlaveVpnService", "mihomo start failed", e)
                    currentState = "error"
                    currentError = "mihomo: $msg"
                    appendLog("[service] mihomo start failed: $msg")
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

    /**
     * Append the Android TUN block to the shared Clash YAML. The renderer emits
     * the config WITHOUT a tun section (tunEnabled:false); we add it here with
     * the VpnService fd. auto-route/auto-detect-interface are false because the
     * OS routing is owned by VpnService and outbound binding by the socket hook.
     */
    private fun injectTunFd(configYaml: String, fd: Int): String {
        val tunBlock = buildString {
            append("\n")
            append("tun:\n")
            append("  enable: true\n")
            append("  file-descriptor: ").append(fd).append("\n")
            append("  stack: gvisor\n")
            append("  mtu: ").append(TUN_MTU).append("\n")
            append("  auto-route: false\n")
            append("  auto-detect-interface: false\n")
            append("  dns-hijack:\n")
            append("    - any:53\n")
        }
        return configYaml.trimEnd() + "\n" + tunBlock
    }

    private fun stopVpn() {
        scope.launch {
            try { ClashBridge.stop() } catch (_: Exception) { }
        }
        coreJob?.cancel()
        coreJob = null
        cleanupTun()
        currentState = "disconnected"
        notify("Отключено")
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun cleanupTun() {
        try { tunInterface?.close() } catch (_: Exception) { }
        tunInterface = null
    }

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
        try { ClashBridge.stop() } catch (_: Exception) { }
        cleanupTun()
    }

    override fun onRevoke() {
        // System or user revoked VPN — core must stop cleanly
        try { ClashBridge.stop() } catch (_: Exception) { }
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
