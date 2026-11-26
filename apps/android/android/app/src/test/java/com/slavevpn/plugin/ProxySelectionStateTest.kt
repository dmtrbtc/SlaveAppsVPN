package com.slavevpn.plugin

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ProxySelectionStateTest {
    @Test
    fun autoAcceptsItsEffectiveLeafWithoutFlatteningTheTarget() {
        val state = ProxySelectionState("AUTO")
        assertTrue(state.confirms("AUTO", "node-a"))
        state.applied("SELECT", "AUTO")
        assertEquals("AUTO", state.previousTarget("SELECT", "node-a"))
    }

    @Test
    fun failedManualSwitchRestoresAutoEvenAfterItsWinnerChanged() {
        val state = ProxySelectionState("AUTO")
        state.applied("SELECT", "AUTO")
        assertFalse(state.confirms("node-c", "node-b"))
        assertEquals("AUTO", state.previousTarget("SELECT", "node-b"))
    }

    @Test
    fun manualSelectionStillRequiresTheRequestedNode() {
        val state = ProxySelectionState("AUTO")
        assertTrue(state.confirms("node-a", "node-a"))
        assertFalse(state.confirms("node-a", "node-b"))
        assertFalse(state.confirms("OTHER-GROUP", "node-a"))
    }

    @Test
    fun emptyLeafDoesNotConfirmEitherTypeOfSelection() {
        val state = ProxySelectionState("AUTO")
        assertFalse(state.confirms("AUTO", ""))
        assertFalse(state.confirms("AUTO", " "))
        assertFalse(state.confirms("node-a", ""))
    }

    @Test
    fun manualTargetIsRememberedAndGroupsStayIndependent() {
        val state = ProxySelectionState("AUTO")
        state.applied("SELECT", "node-a")
        state.applied("OTHER", "AUTO")
        assertEquals("node-a", state.previousTarget("SELECT", "node-b"))
        assertEquals("AUTO", state.previousTarget("OTHER", "node-c"))
    }

    @Test
    fun aNewCoreDoesNotReuseSelectionStateFromThePreviousConfig() {
        val state = ProxySelectionState("AUTO")
        state.applied("SELECT", "AUTO")
        state.reset()
        assertEquals("node-c", state.previousTarget("SELECT", "node-c"))
    }
}
