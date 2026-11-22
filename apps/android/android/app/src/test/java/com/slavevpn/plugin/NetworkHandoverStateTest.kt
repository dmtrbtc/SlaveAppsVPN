package com.slavevpn.plugin

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NetworkHandoverStateTest {
    @Test
    fun suspendedNetworkWaitsAndItsResumeRequiresRecoveryWithoutChangingIdentity() {
        val state = NetworkHandoverState<String>()
        state.update("lte")
        state.connected(state.snapshot())

        assertTrue(state.update("lte", usable = false))
        assertFalse(state.needsRecovery())
        assertFalse(state.update("lte", usable = false))
        assertTrue(state.update("lte", usable = true))
        assertTrue(state.needsRecovery())
        state.connected(state.snapshot())
        assertFalse(state.update("lte", usable = true))
        assertFalse(state.needsRecovery())
    }

    @Test
    fun resumeDuringStartupIsNotAcknowledgedByTheOlderStart() {
        val state = NetworkHandoverState<String>()
        state.update("lte")
        val starting = state.snapshot()
        state.update("lte", usable = false)
        state.update("lte", usable = true)
        state.connected(starting)
        assertTrue(state.needsRecovery())
    }

    @Test
    fun losingASuspendedNetworkWaitsForAnotherUsableNetwork() {
        val state = NetworkHandoverState<String>()
        state.update("lte", usable = false)
        state.update(null)
        assertFalse(state.needsRecovery())
        state.update("wifi", usable = false)
        assertFalse(state.needsRecovery())
        state.update("wifi", usable = true)
        assertTrue(state.needsRecovery())
    }

    @Test
    fun initialCallbackForTheConnectedNetworkDoesNotRestartTheCore() {
        val state = NetworkHandoverState<String>()
        state.update("wifi")
        state.connected(state.snapshot())

        assertFalse(state.update("wifi"))
        assertFalse(state.needsRecovery())
    }

    @Test
    fun wifiToExistingLteAndBackBothRequireRecovery() {
        val state = NetworkHandoverState<String>()
        state.update("wifi")
        state.connected(state.snapshot())

        state.update("lte")
        assertTrue(state.needsRecovery())
        state.connected(state.snapshot())
        state.update("wifi")
        assertTrue(state.needsRecovery())
    }

    @Test
    fun aSecondHandoverDuringStartupRemainsPending() {
        val state = NetworkHandoverState<String>()
        state.update("wifi")
        val startingOnWifi = state.snapshot()
        state.update("lte")
        state.connected(startingOnWifi)

        assertTrue(state.needsRecovery())
        val startingOnLte = state.snapshot()
        state.update("wifi")
        state.connected(startingOnLte)
        assertTrue(state.needsRecovery())
        state.connected(state.snapshot())
        assertFalse(state.needsRecovery())
    }

    @Test
    fun lossWaitsForAvailabilityAndRecoversEvenIfTheNetworkIdentityReturns() {
        val state = NetworkHandoverState<String>()
        state.update("wifi")
        state.connected(state.snapshot())

        state.update(null)
        assertFalse(state.needsRecovery())
        state.update("wifi")
        assertTrue(state.needsRecovery())
    }
}
