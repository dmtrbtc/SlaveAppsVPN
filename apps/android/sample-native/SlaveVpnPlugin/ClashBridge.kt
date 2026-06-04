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

    /**
     * Switch the active member of a select group (default SLAVE-SELECT) to a
     * specific node. New connections egress through it. Throws if the core is
     * not running or the name is unknown.
     */
    fun selectProxy(name: String, group: String = SELECT_GROUP) {
        // Runtime diagnostics → Диагностика→Логи: prove whether the choice
        // reaches the core and what the active leaf is before/after.
        val before = currentProxy(group)
        SlaveVpnService.appendLog("[selector] selectProxy($group, $name) — current before=$before")
        Clashbox.selectProxy(group, name)
        SlaveVpnService.appendLog("[selector] selectProxy done — current after=${currentProxy(group)}")
    }

    /** Effective active proxy (leaf node) of a group, "" if unknown / not running. */
    fun currentProxy(group: String = SELECT_GROUP): String =
        try { Clashbox.currentProxy(group) } catch (_: Throwable) { "" }

    /** Live traffic as JSON {up,down,upTotal,downTotal} (bytes / bytes-per-sec). */
    fun getTraffic(): String =
        try { Clashbox.getTraffic() } catch (_: Throwable) { "{}" }

    /** Active connections snapshot as clash-API JSON. */
    fun getConnections(): String =
        try { Clashbox.getConnections() } catch (_: Throwable) { "{}" }

    /** Proxy latency (ms) via URL test; -1 on error/timeout. */
    fun testDelay(name: String, url: String, timeoutMs: Int): Long =
        try { Clashbox.testDelay(name, url, timeoutMs.toLong()) } catch (_: Throwable) { -1L }

    /** Current rule-providers (bypass lists) status JSON, without refreshing. */
    fun getRuleProviders(): String =
        try { Clashbox.getRuleProviders() } catch (_: Throwable) { "[]" }

    /**
     * Force-refresh every rule-provider NOW (the «Обновить списки» action) and
     * return the resulting status JSON [{name,behavior,count,ok,error}]. Logs the
     * outcome to Диагностика→Логи so a failed list refresh is visible on device.
     */
    fun updateRuleProviders(): String {
        SlaveVpnService.appendLog("[rules] force-update rule-providers requested")
        val json = try { Clashbox.updateRuleProviders() } catch (e: Throwable) {
            SlaveVpnService.appendLog("[rules] update FAILED: ${e.message}")
            "[]"
        }
        SlaveVpnService.appendLog("[rules] force-update result: $json")
        return json
    }

    fun version(): String = try { Clashbox.version() } catch (_: Throwable) { "unknown" }

    // Must match SLAVE_SELECT_GROUP in @slave-vpn/config generateMihomoConfig.
    const val SELECT_GROUP = "SLAVE-SELECT"
}
