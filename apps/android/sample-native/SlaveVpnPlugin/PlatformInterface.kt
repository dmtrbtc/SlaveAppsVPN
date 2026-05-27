package com.slavevpn.plugin

import android.content.Context
import android.net.ConnectivityManager
import android.net.LinkAddress
import android.os.Build
import io.nekohasekai.libbox.InterfaceUpdateListener
import io.nekohasekai.libbox.NetworkInterfaceIterator
import io.nekohasekai.libbox.PlatformInterface
import io.nekohasekai.libbox.TunOptions

/**
 * Minimal PlatformInterface implementation libbox needs to talk to Android.
 *
 * We hand TUN file descriptor via SlaveVpnService.tunFd (the fd that
 * VpnService.Builder.establish() produced). libbox reads/writes raw IP
 * packets on that fd.
 *
 * Most callbacks below are no-op stubs — they're only consulted by sing-box
 * features we don't enable on Android (system proxy, autoroute via netlink,
 * etc.). The required ones are openTun(), writeLog(), and useProcFs().
 */
class SlavePlatformInterface(
    private val service: SlaveVpnService,
) : PlatformInterface {

    override fun usePlatformAutoDetectInterfaceControl(): Boolean = true

    override fun autoDetectInterfaceControl(fd: Int) {
        // Protect the socket fd so traffic going OUT of libbox to the proxy
        // server does NOT loop back through the TUN.
        service.protect(fd)
    }

    override fun openTun(options: TunOptions): Int {
        // libbox calls this asking for an opened TUN fd.
        // We've already opened it in SlaveVpnService.startVpn(), so just hand it over.
        val fd = service.tunFd
        if (fd <= 0) throw RuntimeException("TUN not established yet")
        // Detach so libbox owns the fd lifecycle (single owner avoids double-close)
        service.releaseTunOwnership()
        return fd
    }

    override fun writeLog(message: String?) {
        // sing-box log → Android logcat
        android.util.Log.d("libbox", message ?: "")
    }

    override fun useProcFs(): Boolean = false  // restricted on Android 11+

    override fun findConnectionOwner(
        ipProto: Int, sourceAddress: String?, sourcePort: Int,
        destinationAddress: String?, destinationPort: Int,
    ): Int = -1  // not used (per-app rules go via VpnService.Builder, not libbox)

    override fun packageNameByUid(uid: Int): String =
        service.packageManager.getNameForUid(uid) ?: ""

    override fun uidByPackageName(packageName: String?): Int {
        if (packageName == null) return -1
        return try {
            service.packageManager.getApplicationInfo(packageName, 0).uid
        } catch (_: Exception) { -1 }
    }

    // ─── Network change tracking — libbox optionally wants to know when the
    // underlying network (Wi-Fi / mobile) changes so it can rebind sockets. We
    // could wire ConnectivityManager.NetworkCallback here but for v1 this is
    // optional — libbox will fall back to passive detection.

    override fun usePlatformDefaultInterfaceMonitor(): Boolean = false
    override fun startDefaultInterfaceMonitor(listener: InterfaceUpdateListener?) { /* no-op */ }
    override fun closeDefaultInterfaceMonitor(listener: InterfaceUpdateListener?) { /* no-op */ }

    override fun usePlatformInterfaceGetter(): Boolean = false
    override fun getInterfaces(): NetworkInterfaceIterator? = null

    override fun underNetworkExtension(): Boolean = false
    override fun includeAllNetworks(): Boolean = false

    override fun readWIFIState(): io.nekohasekai.libbox.WIFIState? = null

    override fun clearDNSCache() { /* no-op */ }

    @Suppress("unused")
    private fun isVpnOnly(context: Context): Boolean = false
}
