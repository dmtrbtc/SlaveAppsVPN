package com.slavevpn.plugin

import java.util.Locale

/**
 * Pure traffic-formatting helpers (no Android dependencies) so they are
 * unit-testable on the JVM.
 */
object TrafficFormat {
    /** Human-readable bytes-per-second (Б/с, КБ/с, МБ/с); negative values clamp to 0. */
    fun formatSpeed(bytesPerSec: Long): String {
        val b = if (bytesPerSec < 0) 0L else bytesPerSec
        return when {
            b < 1024L -> "$b Б/с"
            b < 1024L * 1024L -> String.format(Locale.ROOT, "%.0f КБ/с", b / 1024.0)
            else -> String.format(Locale.ROOT, "%.1f МБ/с", b / (1024.0 * 1024.0))
        }
    }

    /** Notification line from raw clash traffic counters: "↓ x КБ/с   ↑ y КБ/с". */
    fun notificationLine(downBytesPerSec: Long, upBytesPerSec: Long): String =
        "↓ ${formatSpeed(downBytesPerSec)}   ↑ ${formatSpeed(upBytesPerSec)}"
}
