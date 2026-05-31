package com.slavevpn.plugin

import android.util.Log
import io.nekohasekai.libbox.BoxService
import io.nekohasekai.libbox.Libbox
import io.nekohasekai.libbox.SetupOptions
import org.json.JSONObject

/**
 * Thin Kotlin wrapper around io.nekohasekai.libbox.* (sing-box mobile bindings).
 *
 * Lifecycle:
 *   SingboxBridge.setup(ctx)             — once on app start
 *   SingboxBridge.start(json, platform)  — every "connect"
 *   SingboxBridge.stop()                 — every "disconnect"
 *
 * All calls block until the underlying Go runtime completes. Make sure to
 * invoke from a worker thread (we use coroutines on Dispatchers.IO).
 */
object SingboxBridge {
    private const val TAG = "SingboxBridge"

    @Volatile private var service: BoxService? = null

    /**
     * Initialise libbox global state (logging dirs, base path). Called once.
     * basePath should be context.filesDir.absolutePath.
     */
    fun setup(basePath: String, workingPath: String, tempPath: String) {
        val opts = SetupOptions().apply {
            this.basePath = basePath
            this.workingPath = workingPath
            this.tempPath = tempPath
            this.isTVOS = false
        }
        Libbox.setup(opts)
        Log.i(TAG, "libbox setup: base=$basePath workingPath=$workingPath")
    }

    /**
     * Start a sing-box service from a JSON config (same format as generated
     * by our SingboxConfigCompiler). Throws on failure.
     */
    fun start(configJson: String, platform: SlavePlatformInterface) {
        if (service != null) {
            Log.w(TAG, "start called while already running — stopping previous")
            stop()
        }

        // Quick sanity check on config so we get a friendly error before Go panics
        try {
            JSONObject(configJson)
        } catch (e: Exception) {
            throw IllegalArgumentException("Invalid sing-box config JSON: ${e.message}")
        }

        Log.i(TAG, "Creating sing-box service (${configJson.length} chars of config)")
        val svc = Libbox.newService(configJson, platform)
            ?: throw RuntimeException("Libbox.newService returned null")

        try {
            svc.start()
        } catch (e: Exception) {
            Log.e(TAG, "Service start failed", e)
            try { svc.close() } catch (_: Exception) { }
            throw e
        }
        service = svc
        Log.i(TAG, "sing-box service started")
    }

    fun stop() {
        val svc = service ?: return
        service = null
        try {
            svc.close()
            Log.i(TAG, "sing-box service stopped")
        } catch (e: Exception) {
            Log.w(TAG, "stop() error", e)
        }
    }

    fun isRunning(): Boolean = service != null

    /** Sleep notify — call when device sleeps so libbox can pause keepalives.
     *  libbox exposes this as pause()/wake() (there is no sleep()). */
    fun sleep() { service?.pause() }
    fun wake() { service?.wake() }

    /** Returns libbox version (for diagnostics) */
    fun version(): String = try { Libbox.version() } catch (_: Throwable) { "unknown" }
}
