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
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.service.quicksettings.TileService
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.core.graphics.drawable.toBitmap
import com.slavevpn.app.MainActivity
import com.slavevpn.app.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject

class SlaveVpnService : VpnService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var tunInterface: ParcelFileDescriptor? = null
    private var coreJob: Job? = null
    // Polls the core's live traffic and refreshes the notification text with the
    // current ↓/↑ speed while connected. Cancelled on stop/reconnect/destroy.
    private var trafficJob: Job? = null
    // Watches the active (non-VPN) network so the tunnel follows Wi-Fi↔mobile switches.
    private var networkCallback: android.net.ConnectivityManager.NetworkCallback? = null
    private var networkInitialized = false
    private var lastNetworkReconnectAt = 0L

    companion object {
        const val ACTION_START = "com.slavevpn.START"
        const val ACTION_STOP  = "com.slavevpn.STOP"
        // Notification «Переподключить» — full core restart with the cached config
        // (re-establishes the tunnel and re-picks a live node; fixes a stale node
        // held after Doze). Carries no extras; reconnect() reads the last config.
        const val ACTION_RECONNECT = "com.slavevpn.RECONNECT"
        const val EXTRA_CONFIG = "config"
        const val EXTRA_SELECTED = "selectedProxy"
        const val EXTRA_SPLIT_MODE = "splitMode"   // off | include | exclude
        const val EXTRA_SPLIT_APPS = "splitApps"    // package names
        const val EXTRA_KILL_SWITCH = "killSwitch"  // "1"/"0" — block traffic on VPN drop
        const val CHANNEL_ID   = "slavevpn_persistent"
        const val NOTIF_ID     = 100
        // Brand accent (app UI accent blue) — tints the notification small icon + title.
        // Not `const` because .toInt() isn't a constant expression.
        val BRAND_COLOR = 0xFF5B8DEF.toInt()
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

        // Kill switch: when ON, a VPN drop (core fails to start, or a reconnect)
        // must NOT expose the raw network. We keep the blocking TUN interface up so
        // packets are blackholed instead of leaking. Live-toggled from the bridge
        // and carried on ACTION_START; the running service reads it at drop time.
        @JvmStatic @Volatile var killSwitchEnabled: Boolean = false
            private set
        @JvmStatic fun setKillSwitch(enabled: Boolean) { killSwitchEnabled = enabled }

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

        // ─── Last-config cache (for the Quick Settings tile) ─────────────────
        // The mihomo config is compiled by the JS renderer and handed to the
        // service via EXTRA_CONFIG. The QS tile can start the service when the
        // app is closed, where no fresh config exists — so we persist the last
        // successfully-connected config bundle here. The tile reads it for a
        // one-tap connect; if absent (never connected) it opens the app instead.
        private const val PREFS = "slavevpn_last_config"
        private const val K_CONFIG = "config"
        private const val K_SELECTED = "selected"
        private const val K_SPLIT_MODE = "splitMode"
        private const val K_SPLIT_APPS = "splitApps" // newline-joined package names

        data class CachedConfig(
            val config: String,
            val selected: String?,
            val splitMode: String,
            val splitApps: List<String>,
        )

        @JvmStatic
        fun cacheConfig(ctx: Context, config: String, selected: String?, splitMode: String, splitApps: List<String>) {
            if (config.isBlank()) return
            try {
                ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                    .putString(K_CONFIG, config)
                    .putString(K_SELECTED, selected)
                    .putString(K_SPLIT_MODE, splitMode)
                    .putString(K_SPLIT_APPS, splitApps.joinToString("\n"))
                    .apply()
            } catch (_: Exception) { }
        }

        @JvmStatic
        fun readCachedConfig(ctx: Context): CachedConfig? {
            return try {
                val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                val cfg = p.getString(K_CONFIG, null)
                if (cfg.isNullOrBlank()) return null
                val apps = p.getString(K_SPLIT_APPS, "")
                    ?.split("\n")?.filter { it.isNotBlank() } ?: emptyList()
                CachedConfig(cfg, p.getString(K_SELECTED, null), p.getString(K_SPLIT_MODE, "off") ?: "off", apps)
            } catch (_: Exception) { null }
        }

        // Ask the QS tile to re-read state and redraw. Cheap no-op when the tile
        // isn't added; keeps the shade toggle in sync without opening the app.
        @JvmStatic
        fun requestTileUpdate(ctx: Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return
            try {
                TileService.requestListeningState(ctx, ComponentName(ctx, SlaveVpnTileService::class.java))
            } catch (_: Exception) { }
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
                // Kill-switch flag rides on the start intent ("1"/"0"); default to
                // the last live-toggled value if the extra is absent.
                intent.getStringExtra(EXTRA_KILL_SWITCH)?.let { setKillSwitch(it == "1" || it == "true") }
                startVpn(
                    config,
                    intent.getStringExtra(EXTRA_SELECTED),
                    intent.getStringExtra(EXTRA_SPLIT_MODE) ?: "off",
                    intent.getStringArrayExtra(EXTRA_SPLIT_APPS)?.toList() ?: emptyList(),
                )
            }
            ACTION_STOP -> stopVpn()
            ACTION_RECONNECT -> reconnect()
        }
        return START_STICKY
    }

    private fun startVpn(
        configYaml: String,
        selectedProxy: String?,
        splitMode: String = "off",
        splitApps: List<String> = emptyList(),
    ) {
        if (currentState == "connected" || currentState == "connecting") return
        currentState = "connecting"
        currentError = null  // fresh attempt — clear any prior failure reason
        requestTileUpdate(applicationContext)
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

            // Per-app split tunnel. include → ONLY these apps go through the VPN;
            // exclude → all apps EXCEPT these. Empty list / "off" ⇒ all apps tunnel.
            applySplitTunnel(builder, splitMode, splitApps)

            // A kill-switch reconnect keeps the previous TUN up (blocking) so there's
            // no leak gap. establish() atomically replaces the interface; we then
            // release the old fd — a seamless handover with no window of raw traffic.
            val previousTun = tunInterface
            val pfd = builder.establish()
                ?: throw RuntimeException("VpnService.Builder.establish() returned null")
            tunInterface = pfd
            if (previousTun != null && previousTun !== pfd) {
                try { previousTun.close() } catch (_: Exception) { }
            }

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
                    ensureGeoFiles()
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
                    // Persist this known-good config so the QS tile can re-connect
                    // with one tap even when the app process is gone.
                    cacheConfig(applicationContext, configYaml, selectedProxy, splitMode, splitApps)
                    requestTileUpdate(applicationContext)
                    appendLog("[service] connected · mihomo ${ClashBridge.version()}")
                    notify("Подключено · mihomo ${ClashBridge.version()}")
                    // Begin live ↓/↑ speed updates in the notification.
                    startTrafficUpdates()
                    // Follow Wi-Fi↔mobile switches so the tunnel reconnects fast.
                    registerNetworkMonitor()
                } catch (e: Exception) {
                    val msg = e.message ?: e.javaClass.simpleName
                    android.util.Log.e("SlaveVpnService", "mihomo start failed", e)
                    currentState = "error"
                    currentError = "mihomo: $msg"
                    requestTileUpdate(applicationContext)
                    appendLog("[service] mihomo start failed: $msg")
                    if (killSwitchEnabled) {
                        // Kill switch ON: DON'T tear down the TUN. The blocking
                        // interface stays up so every packet is blackholed — no leak
                        // to the raw network. The service keeps running (foreground);
                        // the user releases it from the «Отключить» notification action.
                        appendLog("[service] kill-switch: ядро не поднялось → трафик заблокирован (TUN держим)")
                        notify("Трафик заблокирован (kill switch) · нажмите «Отключить»")
                    } else {
                        notify("Ошибка: $msg")
                        cleanupTun()
                        stopSelf()
                    }
                }
            }
        } catch (e: Exception) {
            val msg = e.message ?: e.javaClass.simpleName
            android.util.Log.e("SlaveVpnService", "VPN setup failed", e)
            currentState = "error"
            currentError = "tun: $msg"
            requestTileUpdate(applicationContext)
            appendLog("[service] VPN setup failed: $msg")
            notify("Ошибка: $msg")
            cleanupTun()
            stopSelf()
        }
    }

    /**
     * Copy the geo databases bundled in the APK (assets/geo/) into mihomo's
     * working dir (filesDir) once, so the core loads them locally instead of
     * downloading ~23 MB via geox-url on the FIRST connect — that cold download
     * was the occasional first-connect timeout. If a bundled copy is missing the
     * core falls back to its geox-url download (previous behaviour).
     */
    private fun ensureGeoFiles() {
        for (name in listOf("geoip.dat", "geosite.dat")) {
            val dest = java.io.File(filesDir, name)
            if (dest.exists() && dest.length() > 0L) continue
            try {
                assets.open("geo/$name").use { input ->
                    dest.outputStream().use { out -> input.copyTo(out) }
                }
                appendLog("[service] geo: bundled $name (${dest.length()} bytes)")
            } catch (e: Exception) {
                appendLog("[service] geo: no bundled $name (${e.message})")
            }
        }
    }

    /**
     * Apply per-app split tunnel to the VpnService.Builder. A package that's no
     * longer installed throws NameNotFoundException — skip it rather than abort.
     * If nothing is applicable the tunnel covers all apps (the safe default).
     */
    private fun applySplitTunnel(builder: Builder, mode: String, apps: List<String>) {
        if (mode == "off" || apps.isEmpty()) {
            // Always log the split decision so «раздельный туннель не работает»
            // reports are diagnosable: here NO per-app filter applies → every app
            // goes through the tunnel (the VPN mode's routing decides include/exclude).
            appendLog("[service] split-tunnel: OFF — all apps via VPN (mode=$mode, selected=${apps.size})")
            return
        }
        var applied = 0
        for (pkg in apps) {
            try {
                when (mode) {
                    "include" -> builder.addAllowedApplication(pkg)
                    "exclude" -> builder.addDisallowedApplication(pkg)
                    else -> {}
                }
                applied++
            } catch (e: Exception) {
                appendLog("[service] split: skip $pkg (${e.message})")
            }
        }
        appendLog("[service] split-tunnel mode=$mode apps=$applied")
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
        unregisterNetworkMonitor()
        trafficJob?.cancel()
        trafficJob = null
        scope.launch {
            try { ClashBridge.stop() } catch (_: Exception) { }
        }
        coreJob?.cancel()
        coreJob = null
        cleanupTun()
        currentState = "disconnected"
        requestTileUpdate(applicationContext)
        notify("Отключено")
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    /**
     * «Переподключить» from the notification: a full core restart reusing the
     * last cached config. Stops mihomo + tears down the TUN, then re-establishes
     * and starts again — so a node held stale after Doze is dropped and a live
     * one re-picked, and all sockets are rebuilt. If there's no cached config
     * (never connected this install) we open the app instead of failing silently.
     */
    private fun reconnect() {
        val bundle = readCachedConfig(applicationContext)
        if (bundle == null) {
            appendLog("[service] reconnect: no cached config — opening app")
            openAppFromService()
            return
        }
        appendLog("[service] reconnect requested")
        trafficJob?.cancel(); trafficJob = null
        currentState = "connecting"
        requestTileUpdate(applicationContext)
        notify("Переподключение…")
        val prevJob = coreJob
        coreJob = null
        scope.launch {
            try { ClashBridge.stop() } catch (_: Exception) { }
            prevJob?.cancel()
            // Kill switch: keep the TUN up across the restart so there's NO leak
            // window — startVpn's establish() replaces it (seamless handover) and
            // closes the old fd. Otherwise tear it down (legacy: brief gap on reconnect).
            if (!killSwitchEnabled) cleanupTun()
            // Let the native core fully release before re-establishing.
            delay(400)
            currentState = "disconnected" // clear the startVpn re-entry guard
            startVpn(bundle.config, bundle.selected, bundle.splitMode, bundle.splitApps)
        }
    }

    /** Bring the app to the foreground (used when the shade asks to act but no
     *  cached config exists to act on). */
    private fun openAppFromService() {
        try {
            val i = Intent(this, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivity(i)
        } catch (_: Exception) { }
    }

    // ─── Network monitor (Wi-Fi ↔ mobile hand-off) ──────────────────────────────
    // When the DEFAULT network changes (e.g. leaving Wi-Fi for mobile), the tunnel's
    // protected sockets stay bound to the dead network and every app hangs — mihomo
    // can't self-recover (its health checks dial over the dead network and all fail),
    // so the user had to reconnect by hand. We watch the default network via
    // registerDefaultNetworkCallback and, on a real hand-off, rebind the underlying
    // network and do a full reconnect automatically (debounced).
    private fun registerNetworkMonitor() {
        if (networkCallback != null) return
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as? android.net.ConnectivityManager ?: return
        networkInitialized = false
        val cb = object : android.net.ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: android.net.Network) {
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
                        setUnderlyingNetworks(arrayOf(network))
                    }
                } catch (_: Exception) { }
                // First callback = the network we're already on (registration echo) →
                // just bind the underlying network. A LATER default-network change
                // (Wi-Fi↔mobile) is a real hand-off: the proxy sockets are stuck on the
                // dead network and mihomo can't self-recover (health checks all fail), so
                // do a FULL reconnect — exactly what the user had to do by hand — debounced
                // to avoid thrashing on flapping networks.
                if (!networkInitialized) { networkInitialized = true; return }
                if (currentState != "connected") return
                val now = System.currentTimeMillis()
                if (now - lastNetworkReconnectAt < 5000) return
                lastNetworkReconnectAt = now
                appendLog("[net] default network changed → auto-reconnect")
                Handler(Looper.getMainLooper()).post { reconnect() }
            }
            override fun onLost(network: android.net.Network) {
                appendLog("[net] network lost")
            }
        }
        try {
            // registerDefaultNetworkCallback fires onAvailable whenever the app's
            // DEFAULT network changes (Wi-Fi→mobile and back) — the actual hand-off.
            // A plain registerNetworkCallback(request) only fires when a *new* network
            // appears, so leaving Wi-Fi for already-active mobile never triggered it
            // (the v0.2.26-dev.1 bug). Fallback to the request form on API < 24.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                cm.registerDefaultNetworkCallback(cb)
            } else {
                val req = android.net.NetworkRequest.Builder()
                    .addCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    .addCapability(android.net.NetworkCapabilities.NET_CAPABILITY_NOT_VPN)
                    .build()
                cm.registerNetworkCallback(req, cb)
            }
            networkCallback = cb
        } catch (_: Exception) { }
    }

    private fun unregisterNetworkMonitor() {
        val cb = networkCallback ?: return
        networkCallback = null
        try {
            (getSystemService(Context.CONNECTIVITY_SERVICE) as? android.net.ConnectivityManager)
                ?.unregisterNetworkCallback(cb)
        } catch (_: Exception) { }
    }

    /**
     * Poll the mihomo traffic API every 2s and refresh the notification with the
     * live ↓/↑ speed. getTraffic() returns {up,down,...} in bytes-per-second.
     * setOnlyAlertOnce on the notification keeps these updates silent.
     */
    private fun startTrafficUpdates() {
        trafficJob?.cancel()
        trafficJob = scope.launch {
            while (isActive && currentState == "connected") {
                val text = try {
                    val t = JSONObject(ClashBridge.getTraffic())
                    val down = t.optLong("down", 0L)
                    val up = t.optLong("up", 0L)
                    "↓ ${formatSpeed(down)}   ↑ ${formatSpeed(up)}"
                } catch (_: Exception) { "" }
                if (text.isNotEmpty()) {
                    notify(text)
                }
                delay(2000)
            }
        }
    }

    /** Human-readable bytes-per-second (Б/с, КБ/с, МБ/с). */
    private fun formatSpeed(bytesPerSec: Long): String {
        val b = if (bytesPerSec < 0) 0L else bytesPerSec
        return when {
            b < 1024L -> "$b Б/с"
            b < 1024L * 1024L -> String.format("%.0f КБ/с", b / 1024.0)
            else -> String.format("%.1f МБ/с", b / (1024.0 * 1024.0))
        }
    }

    private fun cleanupTun() {
        try { tunInterface?.close() } catch (_: Exception) { }
        tunInterface = null
    }

    override fun onDestroy() {
        super.onDestroy()
        unregisterNetworkMonitor()
        trafficJob?.cancel()
        trafficJob = null
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

        val reconnectIntent = Intent(this, SlaveVpnService::class.java).apply { action = ACTION_RECONNECT }
        val reconnectPi = PendingIntent.getService(this, 2, reconnectIntent, flags)

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("SLAVE VPN")
            .setContentText(text)
            // Branded status-bar icon: the monochrome SLAVE shield (Android tints
            // it with setColor below) instead of the generic system padlock.
            .setSmallIcon(R.drawable.ic_tile_vpn)
            .setColor(BRAND_COLOR)
            .setContentIntent(pi)
            .setOngoing(true)
            // Speed updates fire every 2s — alert only on the first post so the
            // shade doesn't buzz/peek on every refresh.
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .addAction(android.R.drawable.ic_popup_sync, "Переподключить", reconnectPi)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Отключить", stopPi)

        // Full-colour app logo as the large icon (right side of the notification).
        try {
            ContextCompat.getDrawable(this, R.mipmap.ic_launcher)
                ?.toBitmap(width = 128, height = 128)
                ?.let { builder.setLargeIcon(it) }
        } catch (_: Exception) { /* fall back to no large icon */ }

        return builder.build()
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
