package com.slavevpn.plugin

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TunDescriptorTest {
    @Test
    fun differentDescriptorIsTransferredWithoutClosingIt() {
        val closed = mutableListOf<Int>()
        val fd = duplicateDistinctTunDescriptor(8, { 3 }, { it }, { closed.add(it) })
        assertEquals(3, fd)
        assertTrue(closed.isEmpty())
    }

    @Test
    fun reusedDescriptorStaysOccupiedUntilAnotherDescriptorIsAcquired() {
        val events = mutableListOf<String>()
        val available = ArrayDeque(listOf(7, 8))
        val fd = duplicateDistinctTunDescriptor(7,
            duplicate = { available.removeFirst().also { events.add("open:$it") } },
            descriptor = { it },
            close = { events.add("close:$it") },
        )
        assertEquals(8, fd)
        assertEquals(listOf("open:7", "open:8", "close:7"), events)
    }

    @Test
    fun failedReplacementDoesNotLeakTheReservedDescriptor() {
        val closed = mutableListOf<Int>()
        var attempts = 0
        try {
            duplicateDistinctTunDescriptor(7,
                duplicate = { if (++attempts == 1) 7 else error("dup failed") },
                descriptor = { it },
                close = { closed.add(it) },
            )
            throw AssertionError("expected allocation failure")
        } catch (expected: IllegalStateException) {
            assertEquals("dup failed", expected.message)
        }
        assertEquals(listOf(7), closed)
    }
}
