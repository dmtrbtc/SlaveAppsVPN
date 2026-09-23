// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

package zerotier

import (
	"net/netip"
	"time"
)

const (
	// TraceLevelNormal enables baseline path, credential, and network events.
	TraceLevelNormal = uint64(0)
	// TraceLevelVerbose additionally enables frame-drop and access-denial traces.
	TraceLevelVerbose = uint64(10)
	// TraceLevelRules additionally enables network rule evaluation traces.
	TraceLevelRules = uint64(15)
	// TraceLevelDebug additionally enables malformed packet, authentication,
	// HELLO, and controller-request diagnostics.
	TraceLevelDebug = uint64(20)
	// TraceLevelInsane is the highest protocol-defined trace threshold, reserved
	// for the most detailed diagnostics.
	TraceLevelInsane = uint64(30)

	// maxRemoteTraceSize bounds one encoded remote trace message.
	maxRemoteTraceSize = 10000
	// maxPendingTraces bounds traces waiting for peer identity or a usable path.
	maxPendingTraces = 64
)

// traceEntry is one key-value field in a remote trace message.
type traceEntry struct {
	key   string
	value []byte
}

// pendingRemoteTrace retains trace data until its destination becomes usable.
type pendingRemoteTrace struct {
	data      []byte
	createdAt time.Time
}

// traceString constructs one string-valued remote trace field.
func traceString(key, value string) traceEntry {
	return traceEntry{key: key, value: []byte(value)}
}

// traceUint constructs one fixed-width hexadecimal remote trace field.
func traceUint(key string, value uint64) traceEntry {
	return traceString(key, formatTraceUint(value))
}

// formatTraceUint formats a uint64 as sixteen lowercase hexadecimal digits.
func formatTraceUint(value uint64) string {
	buffer := make([]byte, 16)
	for i := len(buffer) - 1; i >= 0; i-- {
		buffer[i] = "0123456789abcdef"[value&0xf]
		value >>= 4
	}
	return string(buffer)
}

// sendRemoteTraceLocked encodes and sends or queues trace entries for target.
func (n *Node) sendRemoteTraceLocked(target Address, entries ...traceEntry) {
	if target.IsZero() || target == n.identity.Address() {
		return
	}
	data := make([]byte, 0, 512)
	var err error
	for _, entry := range entries {
		data, err = appendDictionaryEntry(data, entry.key, entry.value)
		if err != nil || len(data) > maxRemoteTraceSize {
			return
		}
	}
	data = append(data, 0)
	now := time.Now()
	peer := n.loadPeerCacheLocked(target, now)
	if peer == nil {
		if n.pendingRemoteTraceCountLocked() >= maxPendingTraces {
			return
		}
		n.pendingRemoteTraces[target] = append(n.pendingRemoteTraces[target], pendingRemoteTrace{data: data, createdAt: now})
		n.requestWhoisLocked(target, now)
		return
	}
	n.sendRemoteTraceDataLocked(peer, data)
}

// sendRemoteTraceDataLocked transmits already encoded trace data to peer.
func (n *Node) sendRemoteTraceDataLocked(peer *peer, data []byte) {
	packet, err := NewPacket(peer.identity.Address(), n.identity.Address(), VerbRemoteTrace)
	if err != nil {
		return
	}
	if err = packet.Append(data...); err != nil || packet.Compress() != nil {
		return
	}
	_ = n.sendPacketLocked(peer, packet, true)
}

// traceTargetsLocked returns configured network trace targets meeting minimum.
func (n *Node) traceTargetsLocked(network *Network, minimum uint64) []Address {
	globalEnabled := traceTargetEnabled(n.remoteTraceTarget, n.remoteTraceLevel, minimum)
	networkEnabled := network != nil && traceTargetEnabled(network.Config.RemoteTraceTarget, network.Config.RemoteTraceLevel, minimum)
	if !globalEnabled && !networkEnabled {
		return nil
	}
	targets := make([]Address, 0, 2)
	if globalEnabled {
		targets = append(targets, n.remoteTraceTarget)
	}
	if networkEnabled && (!globalEnabled || network.Config.RemoteTraceTarget != n.remoteTraceTarget) {
		targets = append(targets, network.Config.RemoteTraceTarget)
	}
	return targets
}

// traceRulesEnabledLocked reports whether rule evaluation details have any
// configured consumer. Keeping this check allocation-free avoids constructing
// the official 512-byte rule trace log for every ordinary data frame.
func (n *Node) traceRulesEnabledLocked(network *Network) bool {
	return traceTargetEnabled(n.remoteTraceTarget, n.remoteTraceLevel, TraceLevelRules) ||
		network != nil && traceTargetEnabled(network.Config.RemoteTraceTarget, network.Config.RemoteTraceLevel, TraceLevelRules)
}

// traceTargetEnabled validates one configured target and level.
func traceTargetEnabled(target Address, level, minimum uint64) bool {
	return !target.IsZero() && !target.IsReserved() && level >= minimum
}

// traceAllTargetsLocked returns unique trace targets across joined networks.
func (n *Node) traceAllTargetsLocked(minimum uint64) []Address {
	seen := make(map[Address]struct{}, len(n.networks)+1)
	targets := make([]Address, 0, len(n.networks)+1)
	add := func(target Address, level uint64) {
		if target.IsZero() || target.IsReserved() || level < minimum {
			return
		}
		if _, exists := seen[target]; exists {
			return
		}
		seen[target] = struct{}{}
		targets = append(targets, target)
	}
	add(n.remoteTraceTarget, n.remoteTraceLevel)
	for _, network := range n.networks {
		add(network.Config.RemoteTraceTarget, network.Config.RemoteTraceLevel)
	}
	return targets
}

// traceNetworkFilterLocked reports detailed rule evaluation for a frame.
func (n *Node) traceNetworkFilterLocked(network *Network, frame Frame, source, destination Address, inbound, noTee bool, decision frameRuleDecision) {
	targets := n.traceTargetsLocked(network, TraceLevelRules)
	if len(targets) == 0 {
		return
	}
	result := uint64(0)
	if decision.result == ruleAccept && decision.redirect.IsZero() {
		result = 1
		if decision.super {
			result = 2
		}
	}
	frameData := frame.Payload
	if len(frameData) > 256 {
		frameData = frameData[:256]
	}
	inboundValue := "0"
	if inbound {
		inboundValue = "1"
	}
	noTeeValue := "0"
	if noTee {
		noTeeValue = "1"
	}
	entries := []traceEntry{
		traceString("event", "2006"),
		traceUint("networkId", network.ID),
		traceUint("sourceZtAddr", source.Uint64()),
		traceUint("destZtAddr", destination.Uint64()),
		traceUint("sourceMac", frame.Source.Uint64()),
		traceUint("destMac", frame.Destination.Uint64()),
		traceUint("etherType", uint64(frame.EtherType)),
		traceUint("vlanId", 0),
		traceString("filterNoTee", noTeeValue),
		traceString("filterInbound", inboundValue),
		traceUint("filterResult", result),
		{key: "filterBaseRuleLog", value: decision.ruleLog},
		traceUint("frameLength", uint64(len(frame.Payload))),
	}
	if decision.matchingCapability {
		entries = append(entries,
			traceEntry{key: "filterCapRuleLog", value: decision.capabilityRuleLog},
			traceUint("filterMatchingCapId", uint64(decision.matchingCapabilityID)),
		)
	}
	if len(frameData) != 0 {
		entries = append(entries, traceEntry{key: "frameData", value: frameData})
	}
	for _, target := range targets {
		n.sendRemoteTraceLocked(target, entries...)
	}
}

// traceOutgoingFrameDropLocked reports an outbound frame policy drop.
func (n *Node) traceOutgoingFrameDropLocked(network *Network, frame Frame, reason string) {
	for _, target := range n.traceTargetsLocked(network, TraceLevelVerbose) {
		entries := []traceEntry{
			traceString("event", "2000"),
			traceUint("networkId", network.ID),
			traceUint("sourceMac", frame.Source.Uint64()),
			traceUint("destMac", frame.Destination.Uint64()),
			traceUint("etherType", uint64(frame.EtherType)),
			traceUint("vlanId", 0),
			traceUint("frameLength", uint64(len(frame.Payload))),
		}
		if reason != "" {
			entries = append(entries, traceString("reason", reason))
		}
		n.sendRemoteTraceLocked(target, entries...)
	}
}

// traceIncomingFrameDropLocked reports an inbound frame policy drop and path.
func (n *Node) traceIncomingFrameDropLocked(network *Network, frame Frame, path pathKey, packet *Packet, reason string) {
	for _, target := range n.traceTargetsLocked(network, TraceLevelVerbose) {
		entries := []traceEntry{
			traceString("event", "2002"),
			traceUint("packetId", packet.PacketID()),
			traceUint("packetVerb", uint64(packet.Verb())),
			traceUint("remoteZtAddr", packet.Source().Uint64()),
			traceString("remotePhyAddr", path.endpoint.String()),
			traceUint("localSocket", uint64(path.localSocket)),
			traceUint("networkId", network.ID),
			traceUint("sourceMac", frame.Source.Uint64()),
			traceUint("destMac", frame.Destination.Uint64()),
		}
		if reason != "" {
			entries = append(entries, traceString("reason", reason))
		}
		n.sendRemoteTraceLocked(target, entries...)
	}
}

// traceInvalidPacketLocked reports malformed unauthenticated wire data.
func (n *Node) traceInvalidPacketLocked(localSocket int64, remote netip.AddrPort, data []byte, reason string) {
	if n.remoteTraceTarget.IsZero() || n.remoteTraceLevel < TraceLevelDebug {
		return
	}
	packet, err := ParsePacket(data)
	if err != nil {
		return
	}
	n.sendRemoteTraceLocked(n.remoteTraceTarget,
		traceString("event", "1005"),
		traceUint("packetId", packet.PacketID()),
		traceUint("packetVerb", uint64(packet.Verb())),
		traceUint("remoteZtAddr", packet.Source().Uint64()),
		traceString("remotePhyAddr", remote.String()),
		traceUint("localSocket", uint64(localSocket)),
		traceUint("packetHops", uint64(packet.Hops())),
		traceString("reason", reason),
	)
}

// tracePacketAuthenticationFailureLocked reports failed packet armor validation.
func (n *Node) tracePacketAuthenticationFailureLocked(localSocket int64, remote netip.AddrPort, packet *Packet, reason string) {
	if n.remoteTraceTarget.IsZero() || n.remoteTraceLevel < TraceLevelDebug {
		return
	}
	n.sendRemoteTraceLocked(n.remoteTraceTarget,
		traceString("event", "1004"),
		traceUint("packetId", packet.PacketID()),
		traceUint("packetHops", uint64(packet.Hops())),
		traceUint("remoteZtAddr", packet.Source().Uint64()),
		traceString("remotePhyAddr", remote.String()),
		traceUint("localSocket", uint64(localSocket)),
		traceString("reason", reason),
	)
}

// traceDroppedHelloLocked reports a rejected peer handshake.
func (n *Node) traceDroppedHelloLocked(localSocket int64, remote netip.AddrPort, packet *Packet, reason string) {
	if n.remoteTraceTarget.IsZero() || n.remoteTraceLevel < TraceLevelDebug {
		return
	}
	// ZeroTier One currently emits PACKET_INVALID here despite defining a
	// separate DROPPED_HELLO event constant.
	n.sendRemoteTraceLocked(n.remoteTraceTarget,
		traceString("event", "1005"),
		traceUint("packetId", packet.PacketID()),
		traceUint("remoteZtAddr", packet.Source().Uint64()),
		traceString("remotePhyAddr", remote.String()),
		traceUint("localSocket", uint64(localSocket)),
		traceString("reason", reason),
	)
}

// pendingRemoteTraceCountLocked returns traces waiting for peer discovery.
func (n *Node) pendingRemoteTraceCountLocked() int {
	count := 0
	for _, traces := range n.pendingRemoteTraces {
		count += len(traces)
	}
	return count
}

// traceNetworkConfigRequestLocked reports an outgoing controller request.
func (n *Node) traceNetworkConfigRequestLocked(networkID uint64, controller Address) {
	if n.remoteTraceTarget.IsZero() || n.remoteTraceLevel < TraceLevelDebug {
		return
	}
	n.sendRemoteTraceLocked(n.remoteTraceTarget,
		traceString("event", "2005"),
		traceUint("networkId", networkID),
		traceUint("networkControllerId", controller.Uint64()),
	)
}

// tracePeerLearnedPathLocked reports a newly authenticated physical path.
func (n *Node) tracePeerLearnedPathLocked(networkID uint64, peer *peer, path pathKey, packetID uint64) {
	var network *Network
	if networkID != 0 {
		network = n.networks[networkID]
	}
	entries := []traceEntry{
		traceString("event", "1002"),
		traceUint("packetId", packetID),
		traceUint("remoteZtAddr", peer.identity.Address().Uint64()),
		traceString("remotePhyAddr", path.endpoint.String()),
		traceUint("localSocket", uint64(path.localSocket)),
	}
	if networkID != 0 {
		entries = append(entries, traceUint("networkId", networkID))
	}
	for _, target := range n.traceTargetsLocked(network, TraceLevelNormal) {
		n.sendRemoteTraceLocked(target, entries...)
	}
}

// tracePeerRedirectedLocked reports a cluster redirect for peer.
func (n *Node) tracePeerRedirectedLocked(peer *peer, path pathKey) {
	entries := []traceEntry{
		traceString("event", "1003"),
		traceUint("remoteZtAddr", peer.identity.Address().Uint64()),
		traceString("remotePhyAddr", path.endpoint.String()),
		traceUint("localSocket", uint64(path.localSocket)),
	}
	for _, target := range n.traceTargetsLocked(nil, TraceLevelNormal) {
		n.sendRemoteTraceLocked(target, entries...)
	}
}

// traceCredentialRejectedLocked reports a rejected network credential.
func (n *Node) traceCredentialRejectedLocked(network *Network, credentialType CredentialType, id uint32, timestamp uint64, issuedTo Address, reason string, info ...uint64) {
	entries := []traceEntry{
		traceString("event", "2003"),
		traceUint("networkId", network.ID),
		traceUint("credType", uint64(credentialType)),
		traceUint("credId", uint64(id)),
		traceUint("credTs", timestamp),
		traceUint("credIssuedTo", issuedTo.Uint64()),
		traceString("reason", reason),
	}
	if len(info) != 0 {
		entries = append(entries, traceUint("credInfo", info[0]))
	}
	for _, target := range n.traceTargetsLocked(network, TraceLevelNormal) {
		n.sendRemoteTraceLocked(target, entries...)
	}
}

// traceRevocationRejectedLocked reports a rejected credential revocation.
func (n *Node) traceRevocationRejectedLocked(network *Network, revocation Revocation, reason string) {
	for _, target := range n.traceTargetsLocked(network, TraceLevelNormal) {
		n.sendRemoteTraceLocked(target,
			traceString("event", "2003"),
			traceUint("networkId", network.ID),
			traceUint("credType", uint64(CredentialTypeRevocation)),
			traceUint("credId", uint64(revocation.ID)),
			traceUint("credRevocationTarget", revocation.Target.Uint64()),
			traceString("reason", reason),
		)
	}
}

// traceNetworkAccessDeniedLocked reports controller denial for a network.
func (n *Node) traceNetworkAccessDeniedLocked(network *Network, path pathKey, packet *Packet) {
	for _, target := range n.traceTargetsLocked(network, TraceLevelVerbose) {
		n.sendRemoteTraceLocked(target,
			traceString("event", "2001"),
			traceUint("packetId", packet.PacketID()),
			traceUint("packetVerb", uint64(packet.Verb())),
			traceUint("remoteZtAddr", packet.Source().Uint64()),
			traceString("remotePhyAddr", path.endpoint.String()),
			traceUint("localSocket", uint64(path.localSocket)),
			traceUint("networkId", network.ID),
		)
	}
}

// traceSurfaceResetLocked reports a peer-observed local endpoint change.
func (n *Node) traceSurfaceResetLocked(reporter *peer, reporterPhysical, localPhysical netip.AddrPort, scope int) {
	entries := []traceEntry{
		traceString("event", "1000"),
		traceUint("remoteZtAddr", reporter.identity.Address().Uint64()),
		traceString("remotePhyAddr", reporterPhysical.String()),
		traceString("localPhyAddr", localPhysical.String()),
		traceUint("phyAddrIpScope", uint64(scope)),
	}
	for _, target := range n.traceAllTargetsLocked(TraceLevelNormal) {
		n.sendRemoteTraceLocked(target, entries...)
	}
}

// tracePeerConfirmingPathLocked reports an outgoing path-confirmation packet.
func (n *Node) tracePeerConfirmingPathLocked(networkID uint64, peer *peer, path pathKey, packetID uint64, verb Verb) {
	var network *Network
	if networkID != 0 {
		network = n.networks[networkID]
	}
	targets := n.traceTargetsLocked(network, TraceLevelNormal)
	if len(targets) == 0 {
		return
	}
	entries := []traceEntry{
		traceString("event", "1001"),
		traceUint("packetId", packetID),
		traceUint("packetVerb", uint64(verb)),
		traceUint("remoteZtAddr", peer.identity.Address().Uint64()),
		traceString("remotePhyAddr", path.endpoint.String()),
		traceUint("localSocket", uint64(path.localSocket)),
	}
	if networkID != 0 {
		entries = append(entries, traceUint("networkId", networkID))
	}
	for _, target := range targets {
		n.sendRemoteTraceLocked(target, entries...)
	}
}
