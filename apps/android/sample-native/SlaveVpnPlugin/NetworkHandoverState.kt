package com.slavevpn.plugin

/** Tracks changes that must survive a core startup or a debounced handover. */
internal class NetworkHandoverState<T> {
    private var network: T? = null
    private var usable = false
    private var revision = 0L
    private var connectedRevision = 0L

    @Synchronized
    fun update(network: T?, usable: Boolean = network != null): Boolean {
        val available = network != null && usable
        if (this.network == network && this.usable == available) return false
        this.network = network
        this.usable = available
        revision++
        return true
    }

    @Synchronized
    fun snapshot(): Long = revision

    @Synchronized
    fun connected(startRevision: Long) {
        connectedRevision = startRevision
    }

    @Synchronized
    fun needsRecovery(): Boolean = usable && revision != connectedRevision
}
