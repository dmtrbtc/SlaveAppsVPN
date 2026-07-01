package com.slavevpn.plugin

import android.util.Log
import com.slavevpn.clash.clashbox.Clashbox
import com.slavevpn.clash.clashbox.LogHandler
import com.slavevpn.clash.clashbox.Protector

/**
 * Thin Kotlin wrapper around the mihomo (Clash.Meta) core via gomobile bindings
 * (com.slavevpn.clash.clashbox.*). Replaces the sing-box libbox bridge — mihomo
 * supports VLESS Encryption (ML-KEM-768 / X25519), which sing-box libbox does not.
 *
 * Lifecycle:
 *   ClashBridge.setup(homeDir)                  — once on app start
 *   ClashBridge.start(configYaml, protect, log) — every "connect"
 *   ClashBridge.stop()                          — every "disconnect"
 *
 * The TUN file descriptor is handed to mihomo via the clash config field
 * `tun.file-descriptor` (injected by SlaveVpnService before calling start).
 * Outbound sockets the core dials to the proxy server are kept out of the TUN
 * via the Protector callback -> VpnService.protect(fd).
 *
 * All native calls block; invoke start/stop from a worker thread.
 */
object ClashBridge {
    private const val TAG = "ClashBridge"

    @Volatile private var running = false

    /** Initialise the core working directory. Safe to call once on app start. */
    fun setup(homeDir: String) {
        Clashbox.setup(homeDir)
        Log.i(TAG, "mihomo setup home=$homeDir version=${version()}")
    }

    /**
     * Parse + apply a Clash YAML config that already carries tun.file-descriptor.
     * `protect` must call VpnService.protect(fd) (return true on success).
     * `onLog` receives (level, message) lines from the core.
     * Throws on parse/apply failure — e.g. an unusable VLESS encryption string
     * surfaces here with a SPECIFIC message rather than a silent failure.
     */
    fun start(
        configYaml: String,
        protect: (Int) -> Boolean,
        onLog: (String, String) -> Unit,
    ) {
        if (running) {
            Log.w(TAG, "start called while running — stopping previous")
            stop()
        }
        Clashbox.setProtector(object : Protector {
            override fun protect(fd: Long): Boolean = protect(fd.toInt())
        })
        Clashbox.startLogForward(object : LogHandler {
            override fun log(level: String, message: String) = onLog(level, message)
        })
        Clashbox.start(configYaml) // throws on failure
        running = true
        Log.i(TAG, "mihomo started")
    }

    fun stop() {
        if (!running) return
        running = false
        try {
            Clashbox.stop()
            Clashbox.stopLogForward()
            Log.i(TAG, "mihomo stopped")
        } catch (e: Exception) {
            Log.w(TAG, "stop() error", e)
        }
    }

    fun isRunning(): Boolean = running

    fun version(): String = try { Clashbox.version() } catch (_: Throwable) { "unknown" }
}
