package com.slavevpn.plugin

/** The requested target can be an automatic group whose effective leaf changes. */
internal class ProxySelectionState(private val autoTarget: String) {
    private val targets = mutableMapOf<String, String>()

    fun confirms(requested: String, activeLeaf: String): Boolean =
        activeLeaf.isNotBlank() && (requested == autoTarget || requested == activeLeaf)

    @Synchronized
    fun previousTarget(group: String, activeLeaf: String): String = targets[group] ?: activeLeaf

    @Synchronized
    fun applied(group: String, target: String) { targets[group] = target }

    @Synchronized
    fun reset() { targets.clear() }
}
