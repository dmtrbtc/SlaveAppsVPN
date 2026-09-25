package com.slavevpn.plugin

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * JVM unit tests for the pure traffic formatting used by the VPN service
 * notification (no Android dependencies).
 */
class TrafficFormatTest {

    @Test fun bytesBelowKib() {
        assertEquals("0 Б/с", TrafficFormat.formatSpeed(0))
        assertEquals("512 Б/с", TrafficFormat.formatSpeed(512))
        assertEquals("1023 Б/с", TrafficFormat.formatSpeed(1023))
    }

    @Test fun kibRangeRoundsToWholeUnits() {
        assertEquals("1 КБ/с", TrafficFormat.formatSpeed(1024))
        assertEquals("12 КБ/с", TrafficFormat.formatSpeed(12 * 1024))
        assertEquals("1024 КБ/с", TrafficFormat.formatSpeed(1024 * 1024 - 1))
    }

    @Test fun mibRangeUsesOneDecimal() {
        assertEquals("1.0 МБ/с", TrafficFormat.formatSpeed(1024 * 1024))
        assertEquals("1.5 МБ/с", TrafficFormat.formatSpeed((1.5 * 1024 * 1024).toLong()))
        assertEquals("17.3 МБ/с", TrafficFormat.formatSpeed((17.3 * 1024 * 1024).toLong()))
    }

    @Test fun negativeCountersClampToZero() {
        assertEquals("0 Б/с", TrafficFormat.formatSpeed(-1))
        assertEquals("0 Б/с", TrafficFormat.formatSpeed(Long.MIN_VALUE))
    }

    @Test fun notificationLineJoinsDownAndUpWithArrows() {
        assertEquals("↓ 512 Б/с   ↑ 2 КБ/с", TrafficFormat.notificationLine(512, 2 * 1024))
    }
}
