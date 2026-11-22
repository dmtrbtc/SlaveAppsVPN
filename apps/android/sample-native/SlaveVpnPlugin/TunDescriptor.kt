package com.slavevpn.plugin

/** Keep the previous numeric fd occupied until its replacement is duplicated.
 * Mihomo 1.19.30 retains LastTunConf after Shutdown; reusing that fd can make
 * ReCreateTun skip creation even though the previous listener was closed. */
internal fun <T> duplicateDistinctTunDescriptor(
    previous: Int?,
    duplicate: () -> T,
    descriptor: (T) -> Int,
    close: (T) -> Unit,
): T {
    val candidate = duplicate()
    if (descriptor(candidate) != previous) return candidate
    return try { duplicate() } finally { close(candidate) }
}
