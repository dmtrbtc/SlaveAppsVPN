/*
 * SAMPLE — basic VpnService that establishes a TUN device.
 *
 * For Phase I-C: opens a TUN with default routing. Doesn't actually route
 * any traffic to a proxy yet — the TUN fd is simply read+discarded in a
 * loop. This proves the permission flow + VpnService lifecycle works.
 *
 * For Phase I-D: pass the tunFd integer to MihomoEngineBridge.start() /
 * SingboxEngineBridge.start() instead of discarding.
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
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.io.FileInputStream
import java.nio.ByteBuffer

class SlaveVpnService : VpnService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var tunInterface: ParcelFileDescriptor? = null
    private var packetJob: Job? = null

    companion object {
        const val ACTION_START = "com.slavevpn.START"
        const val ACTION_STOP  = "com.slavevpn.STOP"
        const val CHANNEL_ID   = "slavevpn_persistent"
        const val NOTIF_ID     = 100

        @JvmStatic var currentState: String = "disconnected"
            private set

        private var currentMode: String = "bypass"
        private var currentEngine: String = "mihomo"

        @JvmStatic fun setMode(mode: String) { currentMode = mode }
        @JvmStatic fun setEngine(engine: String) { currentEngine = engine }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> startVpn()
            ACTION_STOP  -> stopVpn()
        }
        return START_STICKY
    }

    private fun startVpn() {
        if (currentState == "connected" || currentState == "connecting") return
        currentState = "connecting"

        startForeground(NOTIF_ID, buildNotification("Подключение..."))

        try {
            val builder = Builder()
                .setSession("SLAVE VPN")
                .addAddress("172.19.0.1", 30)
                .addRoute("0.0.0.0", 0)
                .addDnsServer("8.8.8.8")
                .addDnsServer("1.1.1.1")
                .setMtu(9000)
                .setBlocking(true)

            // TODO Phase I-D: add per-app routing based on currentMode == "split"
            // builder.addDisallowedApplication("com.example.directly")

            val pfd = builder.establish()
            if (pfd == null) {
                currentState = "error"
                stopSelf()
                return
            }
            tunInterface = pfd
            currentState = "connected"
            notify("Подключено · ${currentEngine}")

            // TODO Phase I-D: hand pfd.detachFd() to the engine .so:
            //   MihomoEngineBridge.start(pfd.detachFd(), configPath)
            // For now — just drain packets so the OS doesn't backpressure
            packetJob = scope.launch {
                val input = FileInputStream(pfd.fileDescriptor)
                val buffer = ByteBuffer.allocate(32 * 1024)
                while (isActive) {
                    val n = try { input.read(buffer.array()) } catch (e: Exception) { -1 }
                    if (n < 0) break
                    // Drop packets — placeholder until engine integration
                }
            }
        } catch (e: Exception) {
            currentState = "error"
            notify("Ошибка: ${e.message}")
            stopSelf()
        }
    }

    private fun stopVpn() {
        packetJob?.cancel()
        packetJob = null
        tunInterface?.close()
        tunInterface = null
        currentState = "disconnected"
        notify("Отключено")
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
        stopVpn()
    }

    override fun onRevoke() {
        // System or user revoked VPN permission
        stopVpn()
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
            .setSmallIcon(android.R.drawable.ic_lock_lock)  // TODO: app icon
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
            CHANNEL_ID,
            "SLAVE VPN",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Active VPN connection"
            setShowBadge(false)
        }
        nm.createNotificationChannel(channel)
    }
}
