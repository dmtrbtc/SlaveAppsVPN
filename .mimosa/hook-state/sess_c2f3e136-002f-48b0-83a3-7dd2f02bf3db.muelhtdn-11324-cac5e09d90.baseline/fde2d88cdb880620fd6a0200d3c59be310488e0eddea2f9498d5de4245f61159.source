// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

package zerotier

import (
	"bytes"
	"crypto/rand"
	"encoding/binary"
	"errors"
	"time"
)

const (
	// EtherTypeIPv4 identifies an IPv4 payload in an Ethernet frame.
	EtherTypeIPv4 = 0x0800
	// EtherTypeARP identifies an ARP payload in an Ethernet frame.
	EtherTypeARP = 0x0806
	// EtherTypeIPv6 identifies an IPv6 payload in an Ethernet frame.
	EtherTypeIPv6 = 0x86dd

	// multicastLikePeriod is the interval between membership announcements.
	multicastLikePeriod = 60 * time.Second
	// multicastMemberExpiration is how long a learned multicast member remains
	// eligible without a new announcement.
	multicastMemberExpiration = 10 * time.Minute
	// multicastTransmitTimeout bounds deferred multicast forwarding work.
	multicastTransmitTimeout = 5 * time.Second
	// multicastExplicitGather controls how often a group may trigger an explicit
	// gather request.
	multicastExplicitGather = time.Minute
	// maxPendingMulticastGroup limits deferred frames retained for one group.
	maxPendingMulticastGroup = 32
	// maxMulticastGroups bounds the learned multicast group table.
	maxMulticastGroups = 4096
	// maxMulticastGroupMembers bounds the learned members retained per group.
	maxMulticastGroupMembers = 4096
	// maxPendingFrames bounds deferred frame-related transmissions globally.
	maxPendingFrames = 256
)

var (
	// ErrNetworkNotReady reports frame I/O before usable configuration exists.
	ErrNetworkNotReady = errors.New("ZeroTier network is not ready")
	// ErrUnsupportedEthernet reports a destination unsupported by the virtual
	// network mode.
	ErrUnsupportedEthernet = errors.New("unsupported ZeroTier Ethernet destination")
	// ErrFrameRejected reports a frame denied by network rules or policy.
	ErrFrameRejected = errors.New("ZeroTier network rules rejected frame")
	// errPacketNotAccepted marks authenticated traffic not accepted by any
	// joined network.
	errPacketNotAccepted = errors.New("ZeroTier packet not accepted")
	// errPacketRetry requests deferred processing after peer discovery.
	errPacketRetry = errors.New("ZeroTier packet processing deferred")
)

// Frame is an Ethernet payload exchanged over a virtual ZeroTier network.
type Frame struct {
	NetworkID   uint64
	Source      MAC
	Destination MAC
	EtherType   uint16
	Payload     []byte
}

// MulticastGroup combines an Ethernet multicast address with an additional
// distinguishing identifier.
type MulticastGroup struct {
	MAC MAC
	ADI uint32
}

// SendFrame submits one virtual Ethernet frame to a joined network.
func (n *Node) SendFrame(networkID uint64, destination MAC, etherType uint16, payload []byte) error {
	n.mu.Lock()
	defer n.unlockAndRunCallbacks()
	if n.closed {
		return ErrNodeClosed
	}
	network := n.networks[networkID]
	if network == nil || network.Status != NetworkStatusOK {
		return ErrNetworkNotReady
	}
	if len(payload) == 0 || len(payload) > int(network.Config.MTU) {
		return ErrInvalidPacket
	}
	source := MACForAddress(n.identity.Address(), networkID)
	frame := Frame{NetworkID: networkID, Source: source, Destination: destination, EtherType: etherType, Payload: payload}
	if destination == source {
		// Inbound frames already live in a core-owned packet buffer. A local
		// loopback frame still aliases its caller, so give the callback an
		// independently owned payload before SendFrame returns.
		frame.Payload = append([]byte(nil), payload...)
		n.deliverFrameLocked(frame)
		return nil
	}
	now := time.Now()
	destinationZT := Address(0)
	if !destination.IsMulticast() && byte(destination.Uint64()>>40) == firstMACOctet(networkID) {
		destinationZT = destination.Address(networkID)
	}
	decision := network.Config.filterFrame(frame, frameRuleContext{
		sourceZT: n.identity.Address(), destinationZT: destinationZT, traceRules: n.traceRulesEnabledLocked(network),
		ownership: network.Config.Ownership, localTags: network.Config.Tags,
		remoteTags: network.tags[destinationZT], capabilities: network.Config.Capabilities,
	})
	n.traceNetworkFilterLocked(network, frame, n.identity.Address(), destinationZT, false, false, decision)
	if decision.result != ruleAccept {
		n.traceOutgoingFrameDropLocked(network, frame, "filter blocked")
		return ErrFrameRejected
	}
	n.sendRuleTeesLocked(network, decision, frame, false, now)
	if !decision.redirect.IsZero() {
		return n.sendRuleFrameWithFlowLocked(network, decision.redirect, frame, 0x04, 0, frameFlowID(frame), now)
	}
	if destination.IsMulticast() {
		return n.sendMulticastLocked(network, frame, now)
	}
	if byte(destination.Uint64()>>40) != firstMACOctet(networkID) {
		return n.sendBridgedFrameLocked(network, frame, now)
	}
	return n.queueOrSendFrameLocked(network, destination.Address(networkID), frame, frameFlowID(frame), now)
}

// sendBridgedFrameLocked routes a frame whose MAC destination is not a native
// ZeroTier node mapping.
func (n *Node) sendBridgedFrameLocked(network *Network, frame Frame, now time.Time) error {
	var bridges []Address
	if route, ok := network.bridgeRoutes[frame.Destination]; ok && now.Sub(route.learned) < bridgeRouteExpiration &&
		network.Config.isSpecialist(route.bridge, specialistTypeActiveBridge) && route.bridge != n.identity.Address() {
		bridges = append(bridges, route.bridge)
	} else {
		delete(network.bridgeRoutes, frame.Destination)
		bridges = network.Config.specialistAddresses(specialistTypeActiveBridge)
		filtered := bridges[:0]
		for _, bridge := range bridges {
			if bridge != n.identity.Address() {
				filtered = append(filtered, bridge)
			}
		}
		bridges = filtered
		shuffleAddresses(bridges)
		if len(bridges) > maxBridgeSpam {
			bridges = bridges[:maxBridgeSpam]
		}
	}
	if len(bridges) == 0 {
		return ErrUnsupportedEthernet
	}
	var result error
	for _, bridge := range bridges {
		send, err := n.filterReplicatedOutboundLocked(network, bridge, frame, now)
		if err != nil {
			result = errors.Join(result, err)
			continue
		}
		if send {
			result = errors.Join(result, n.sendRuleFrameWithFlowLocked(network, bridge, frame, 0, 0, frameFlowID(frame), now))
		}
	}
	return result
}

// queueOrSendFrameLocked sends a frame or defers it until destination discovery.
func (n *Node) queueOrSendFrameLocked(network *Network, destination Address, frame Frame, flowID int32, now time.Time) error {
	peer := n.loadPeerCacheLocked(destination, now)
	if peer == nil {
		n.enqueuePendingFrameLocked(destination, pendingOutboundFrame{frame: frame, flowID: flowID, createdAt: now})
		n.requestWhoisLocked(destination, now)
		return nil
	}
	if err := n.sendCredentialsLocked(network, peer, now); err != nil {
		return err
	}
	packet, err := newPacketWithPayloadCapacity(destination, n.identity.Address(), VerbFrame, 10+len(frame.Payload))
	if err != nil {
		return err
	}
	_ = packet.AppendUint64(network.ID)
	_ = packet.AppendUint16(frame.EtherType)
	_ = packet.Append(frame.Payload...)
	return n.sendPacketWithFlowLocked(peer, packet, true, flowID)
}

// sendRuleFrameLocked sends a rule-generated tee, watch, or redirect frame.
func (n *Node) sendRuleFrameLocked(network *Network, destination Address, frame Frame, flags byte, payloadLength int, now time.Time) error {
	return n.sendRuleFrameWithFlowLocked(network, destination, frame, flags, payloadLength, frameFlowID(frame), now)
}

// sendRuleFrameWithFlowLocked sends a rule-generated frame with a bonding flow.
func (n *Node) sendRuleFrameWithFlowLocked(network *Network, destination Address, frame Frame, flags byte, payloadLength int, flowID int32, now time.Time) error {
	peer := n.loadPeerCacheLocked(destination, now)
	if peer == nil {
		n.enqueuePendingFrameLocked(destination, pendingOutboundFrame{
			frame: frame, extended: true, extendedFlags: flags, payloadLength: payloadLength, flowID: flowID, createdAt: now,
		})
		n.requestWhoisLocked(destination, now)
		return nil
	}
	if err := n.sendCredentialsLocked(network, peer, now); err != nil {
		return err
	}
	packet, err := newPacketWithPayloadCapacity(destination, n.identity.Address(), VerbExtFrame, 23+len(frame.Payload))
	if err != nil {
		return err
	}
	_ = packet.AppendUint64(network.ID)
	_ = packet.Append(flags)
	destinationMAC := frame.Destination.Bytes()
	sourceMAC := frame.Source.Bytes()
	_ = packet.Append(destinationMAC[:]...)
	_ = packet.Append(sourceMAC[:]...)
	_ = packet.AppendUint16(frame.EtherType)
	if payloadLength <= 0 || payloadLength > len(frame.Payload) {
		payloadLength = len(frame.Payload)
	}
	_ = packet.Append(frame.Payload[:payloadLength]...)
	if flags&0x10 != 0 {
		if err := n.addPendingLocked(packet.PacketID(), pendingRequest{verb: VerbExtFrame, peer: peer.identity.Address(), networkID: network.ID, sentAt: now}); err != nil {
			return err
		}
	}
	if err := n.sendPacketWithFlowLocked(peer, packet, true, flowID); err != nil {
		n.deletePendingLocked(packet.PacketID())
		return err
	}
	return nil
}

// sendCredentialsLocked sends currently valid network credentials to peer.
func (n *Node) sendCredentialsLocked(network *Network, peer *peer, now time.Time) error {
	if network.Config.Type == NetworkTypePublic && len(network.Config.Ownership) == 0 && len(network.Config.Tags) == 0 && len(network.Config.Capabilities) == 0 {
		return nil
	}
	if network.Config.Type != NetworkTypePublic && network.Config.COM == nil {
		return ErrNetworkNotReady
	}
	if last := peer.credentialsSent[network.ID]; now.Sub(last) < multicastLikePeriod {
		return nil
	}
	capabilities := make([][]byte, len(network.Config.Capabilities))
	for i, capability := range network.Config.Capabilities {
		capabilities[i] = capability.appendBinary(nil)
	}
	tags := make([][]byte, len(network.Config.Tags))
	for i, tag := range network.Config.Tags {
		tags[i] = tag.appendBinary(nil)
	}
	ownership := make([][]byte, len(network.Config.Ownership))
	for i, certificate := range network.Config.Ownership {
		ownership[i] = certificate.appendBinary(nil)
	}
	capabilityAt, tagAt, ownershipAt := 0, 0, 0
	sendCOM := network.Config.COM != nil
	for sendCOM || capabilityAt < len(capabilities) || tagAt < len(tags) || ownershipAt < len(ownership) {
		payload := make([]byte, 0, MaxPacketSize-PacketMinSize)
		progress := false
		if sendCOM {
			if len(network.Config.COM.raw)+7 > cap(payload) {
				return ErrInvalidPacket
			}
			payload = append(payload, network.Config.COM.raw...)
			sendCOM = false
			progress = true
		}
		payload = append(payload, 0)
		capabilityCountAt := len(payload)
		payload = append(payload, 0, 0)
		capabilityStart := capabilityAt
		for capabilityAt < len(capabilities) && len(payload)+len(capabilities[capabilityAt])+6 <= cap(payload) {
			payload = append(payload, capabilities[capabilityAt]...)
			capabilityAt++
			progress = true
		}
		if capabilityAt == capabilityStart && capabilityAt < len(capabilities) {
			return ErrInvalidPacket
		}
		binary.BigEndian.PutUint16(payload[capabilityCountAt:], uint16(capabilityAt-capabilityStart))

		tagCountAt := len(payload)
		payload = append(payload, 0, 0)
		tagStart := tagAt
		for tagAt < len(tags) && len(payload)+len(tags[tagAt])+4 <= cap(payload) {
			payload = append(payload, tags[tagAt]...)
			tagAt++
			progress = true
		}
		if tagAt == tagStart && tagAt < len(tags) {
			return ErrInvalidPacket
		}
		binary.BigEndian.PutUint16(payload[tagCountAt:], uint16(tagAt-tagStart))
		payload = append(payload, 0, 0) // revocations propagate separately

		ownershipCountAt := len(payload)
		payload = append(payload, 0, 0)
		ownershipStart := ownershipAt
		for ownershipAt < len(ownership) && len(payload)+len(ownership[ownershipAt]) <= cap(payload) {
			payload = append(payload, ownership[ownershipAt]...)
			ownershipAt++
			progress = true
		}
		if ownershipAt == ownershipStart && ownershipAt < len(ownership) {
			return ErrInvalidPacket
		}
		binary.BigEndian.PutUint16(payload[ownershipCountAt:], uint16(ownershipAt-ownershipStart))
		if !progress {
			return ErrInvalidPacket
		}

		packet, err := NewPacket(peer.identity.Address(), n.identity.Address(), VerbNetworkCredentials)
		if err != nil {
			return err
		}
		if err = packet.Append(payload...); err != nil {
			return err
		}
		if err = packet.Compress(); err != nil {
			return err
		}
		if err = n.sendPacketLocked(peer, packet, true); err != nil {
			return err
		}
	}
	peer.credentialsSent[network.ID] = now
	return nil
}

// handleFrameLocked validates and delivers one native virtual Ethernet frame.
func (n *Node) handleFrameLocked(path pathKey, packet *Packet, now time.Time) error {
	payload := packet.Payload()
	if len(payload) < 8 {
		return ErrInvalidPacket
	}
	networkID := binary.BigEndian.Uint64(payload)
	network := n.networks[networkID]
	peer := n.peers[packet.Source()]
	if network == nil || peer == nil || !network.allows(peer) {
		if network != nil && peer != nil {
			_ = n.sendNeedCredentialsLocked(peer, path, packet, networkID)
			n.traceNetworkAccessDeniedLocked(network, path, packet)
			return errPacketRetry
		}
		return nil
	}
	n.markNetworkTrustLocked(network, peer, now)
	if len(payload) <= 10 {
		return nil
	}
	frame := Frame{
		NetworkID:   networkID,
		Source:      MACForAddress(packet.Source(), networkID),
		Destination: MACForAddress(n.identity.Address(), networkID),
		EtherType:   binary.BigEndian.Uint16(payload[8:10]),
		Payload:     payload[10:],
	}
	decision := network.Config.filterFrame(frame, frameRuleContext{
		inbound: true, sourceZT: packet.Source(), destinationZT: n.identity.Address(), traceRules: n.traceRulesEnabledLocked(network),
		ownership: network.ownership[peer.identity.Address()], localTags: network.Config.Tags,
		remoteTags: network.tags[peer.identity.Address()], capabilities: network.capabilities[peer.identity.Address()],
	})
	n.traceNetworkFilterLocked(network, frame, packet.Source(), n.identity.Address(), true, false, decision)
	if decision.result != ruleAccept {
		n.traceIncomingFrameDropLocked(network, frame, path, packet, "filter blocked")
		return nil
	}
	if !n.applyInboundRuleEffectsLocked(network, decision, frame, now) {
		return nil
	}
	n.deliverFrameLocked(frame)
	return nil
}

// handleExtFrameLocked validates and delivers one bridged Ethernet frame.
func (n *Node) handleExtFrameLocked(path pathKey, packet *Packet, now time.Time) error {
	payload := packet.Payload()
	if len(payload) < 8 {
		return ErrInvalidPacket
	}
	networkID := binary.BigEndian.Uint64(payload)
	network := n.networks[networkID]
	peer := n.peers[packet.Source()]
	if network == nil || peer == nil {
		return nil
	}
	if len(payload) < 9 {
		return ErrInvalidPacket
	}
	pos := 9
	if payload[8]&0x01 != 0 {
		certificate, consumed, err := ParseCertificateOfMembership(payload[pos:])
		if err != nil {
			return err
		}
		pos += consumed
		_ = n.addMembershipLocked(network, certificate)
	}
	if !network.allows(peer) {
		_ = n.sendNeedCredentialsLocked(peer, path, packet, networkID)
		n.traceNetworkAccessDeniedLocked(network, path, packet)
		return errPacketRetry
	}
	if len(payload)-pos < 14 {
		return ErrInvalidPacket
	}
	n.markNetworkTrustLocked(network, peer, now)
	if len(payload)-pos == 14 {
		if payload[8]&0x10 != 0 {
			_ = n.sendExtFrameACKLocked(peer, path, packet.PacketID(), networkID)
		}
		return nil
	}
	destination, err := MACFromBytes(payload[pos : pos+6])
	if err != nil {
		return err
	}
	source, err := MACFromBytes(payload[pos+6 : pos+12])
	if err != nil {
		return err
	}
	frame := Frame{NetworkID: networkID, Source: source, Destination: destination, EtherType: binary.BigEndian.Uint16(payload[pos+12:]), Payload: payload[pos+14:]}
	if source.Uint64() == 0 || source.IsMulticast() || source == MACForAddress(n.identity.Address(), networkID) {
		return nil
	}
	decision := network.Config.filterFrame(frame, frameRuleContext{
		inbound: true, sourceZT: packet.Source(), destinationZT: n.identity.Address(), traceRules: n.traceRulesEnabledLocked(network),
		ownership: network.ownership[peer.identity.Address()], localTags: network.Config.Tags,
		remoteTags: network.tags[peer.identity.Address()], capabilities: network.capabilities[peer.identity.Address()],
	})
	n.traceNetworkFilterLocked(network, frame, packet.Source(), n.identity.Address(), true, false, decision)
	if decision.result != ruleAccept {
		n.traceIncomingFrameDropLocked(network, frame, path, packet, "filter blocked")
		if payload[8]&0x10 != 0 {
			_ = n.sendExtFrameACKLocked(peer, path, packet.PacketID(), networkID)
		}
		return nil
	}
	if !decision.super {
		if source != MACForAddress(peer.identity.Address(), networkID) && !network.Config.isSpecialist(peer.identity.Address(), specialistTypeActiveBridge) {
			n.traceIncomingFrameDropLocked(network, frame, path, packet, "bridging not allowed (remote)")
			return nil
		}
		if source != MACForAddress(peer.identity.Address(), networkID) {
			n.learnBridgeRouteLocked(network, source, peer.identity.Address(), now)
		}
		localMAC := MACForAddress(n.identity.Address(), networkID)
		if destination != localMAC && !destination.IsMulticast() && !network.Config.isSpecialist(n.identity.Address(), specialistTypeActiveBridge) {
			n.traceIncomingFrameDropLocked(network, frame, path, packet, "bridging not allowed (local)")
			return nil
		}
		if destination.IsMulticast() && network.Config.MulticastLimit == 0 {
			n.traceIncomingFrameDropLocked(network, frame, path, packet, "multicast disabled")
			return nil
		}
	}
	if !n.applyInboundRuleEffectsLocked(network, decision, frame, now) {
		if payload[8]&0x10 != 0 {
			_ = n.sendExtFrameACKLocked(peer, path, packet.PacketID(), networkID)
		}
		return nil
	}
	n.deliverFrameLocked(frame)
	if payload[8]&0x10 != 0 {
		_ = n.sendExtFrameACKLocked(peer, path, packet.PacketID(), networkID)
	}
	return nil
}

// applyInboundRuleEffectsLocked emits inbound tees and applies redirection.
func (n *Node) applyInboundRuleEffectsLocked(network *Network, decision frameRuleDecision, frame Frame, now time.Time) bool {
	n.sendRuleTeesLocked(network, decision, frame, true, now)
	if !decision.redirect.IsZero() {
		_ = n.sendRuleFrameWithFlowLocked(network, decision.redirect, frame, 0x0a, 0, frameFlowID(frame), now)
		return false
	}
	return true
}

// sendRuleTeesLocked emits all tee and watch copies requested by decision.
func (n *Node) sendRuleTeesLocked(network *Network, decision frameRuleDecision, frame Frame, inbound bool, now time.Time) {
	tees := decision.additionalTee
	if !decision.tee.IsZero() {
		tees = append([]ruleTeeDecision{{target: decision.tee, length: decision.teeLength, watch: decision.watch}}, tees...)
	}
	for _, tee := range tees {
		flags := byte(0x02)
		if inbound {
			flags = 0x08
		}
		if tee.watch {
			if inbound {
				flags = 0x1c
			} else {
				flags = 0x16
			}
		}
		_ = n.sendRuleFrameWithFlowLocked(network, tee.target, frame, flags, tee.length, frameFlowID(frame), now)
	}
}

// sendExtFrameACKLocked acknowledges a bridged frame when requested.
func (n *Node) sendExtFrameACKLocked(peer *peer, path pathKey, packetID, networkID uint64) error {
	reply, err := NewPacket(peer.identity.Address(), n.identity.Address(), VerbOK)
	if err != nil {
		return err
	}
	_ = reply.Append(byte(VerbExtFrame))
	_ = reply.AppendUint64(packetID)
	_ = reply.AppendUint64(networkID)
	_ = n.sendPacketViaPathLocked(peer, reply, true, path, false)
	return nil
}

// handleNetworkCredentialsLocked parses credentials carried by packet.
func (n *Node) handleNetworkCredentialsLocked(peer *peer, packet *Packet, now time.Time) error {
	return n.handleNetworkCredentialsPayloadLocked(peer, packet.Payload(), now)
}

// handleNetworkCredentialsPayloadLocked validates and installs a credential
// payload from peer.
func (n *Node) handleNetworkCredentialsPayloadLocked(peer *peer, payload []byte, now time.Time) error {
	trustedNetworks := make(map[*Network]struct{})
	deferred := false
	finish := func(accepted bool) error {
		if deferred {
			return errPacketRetry
		}
		if !accepted {
			return errPacketNotAccepted
		}
		for network := range trustedNetworks {
			n.markNetworkTrustLocked(network, peer, now)
		}
		return nil
	}
	deferMissing := func(network *Network, err error) {
		if !errors.Is(err, ErrUnknownPeer) {
			return
		}
		deferred = true
		missing := Controller(network.ID)
		n.deferCredentialsLocked(missing, peer.identity.Address(), payload, now)
		n.requestWhoisLocked(missing, now)
	}
	pos := 0
	for pos < len(payload) && payload[pos] != 0 {
		certificate, consumed, err := ParseCertificateOfMembership(payload[pos:])
		if err != nil {
			return err
		}
		pos += consumed
		if network := n.networks[certificate.NetworkID()]; network != nil {
			if err = n.addMembershipLocked(network, certificate); err == nil {
				trustedNetworks[network] = struct{}{}
			} else {
				deferMissing(network, err)
				if !errors.Is(err, ErrUnknownPeer) {
					n.traceCredentialRejectedLocked(network, CredentialTypeCOM, 0, certificate.Timestamp(), certificate.IssuedTo(), err.Error())
				}
			}
		}
	}
	if pos == len(payload) {
		return finish(true)
	}
	pos++ // COM list terminator
	if pos == len(payload) {
		return finish(true)
	}
	if len(payload)-pos < 2 {
		return ErrInvalidPacket
	}
	capabilityCount := int(binary.BigEndian.Uint16(payload[pos:]))
	pos += 2
	if capabilityCount > maxNetworkCapabilities {
		return ErrInvalidPacket
	}
	for i := 0; i < capabilityCount; i++ {
		capability, consumed, err := ParseCapability(payload[pos:])
		if err != nil {
			return err
		}
		pos += consumed
		if network := n.networks[capability.NetworkID]; network != nil {
			if err = n.addCapabilityLocked(network, capability, peer.identity.Address(), now); err == nil {
				trustedNetworks[network] = struct{}{}
			} else if errors.Is(err, ErrUnknownPeer) {
				deferred = true
			} else {
				n.traceCredentialRejectedLocked(network, CredentialTypeCapability, capability.ID, capability.Timestamp, capability.IssuedTo(), err.Error())
			}
		}
	}
	if pos == len(payload) {
		return finish(false)
	}
	if len(payload)-pos < 2 {
		return ErrInvalidPacket
	}
	tagCount := int(binary.BigEndian.Uint16(payload[pos:]))
	pos += 2
	if tagCount > maxNetworkTags {
		return ErrInvalidPacket
	}
	for i := 0; i < tagCount; i++ {
		tag, consumed, err := ParseTag(payload[pos:])
		if err != nil {
			return err
		}
		pos += consumed
		if network := n.networks[tag.NetworkID]; network != nil {
			if err = n.addTagLocked(network, tag); err == nil {
				trustedNetworks[network] = struct{}{}
			} else {
				deferMissing(network, err)
				if !errors.Is(err, ErrUnknownPeer) {
					n.traceCredentialRejectedLocked(network, CredentialTypeTag, tag.ID, tag.Timestamp, tag.IssuedTo, err.Error(), uint64(tag.Value))
				}
			}
		}
	}
	if pos == len(payload) {
		return finish(false)
	}
	if len(payload)-pos < 2 {
		return ErrInvalidPacket
	}
	revocationCount := int(binary.BigEndian.Uint16(payload[pos:]))
	pos += 2
	if revocationCount > maxRevocationsPerPacket {
		return ErrInvalidPacket
	}
	for i := 0; i < revocationCount; i++ {
		revocation, consumed, err := ParseRevocation(payload[pos:])
		if err != nil {
			return err
		}
		pos += consumed
		if network := n.networks[revocation.NetworkID]; network != nil {
			if err = n.addRevocationLocked(network, peer.identity.Address(), revocation); err == nil {
				trustedNetworks[network] = struct{}{}
			} else {
				deferMissing(network, err)
				if !errors.Is(err, ErrUnknownPeer) {
					n.traceRevocationRejectedLocked(network, revocation, err.Error())
				}
			}
		}
	}
	if pos == len(payload) {
		return finish(false)
	}
	if len(payload)-pos < 2 {
		return ErrInvalidPacket
	}
	count := int(binary.BigEndian.Uint16(payload[pos:]))
	pos += 2
	if count > maxOwnershipCerts {
		return ErrInvalidPacket
	}
	for i := 0; i < count; i++ {
		certificate, consumed, err := ParseCertificateOfOwnership(payload[pos:])
		if err != nil {
			return err
		}
		pos += consumed
		if network := n.networks[certificate.NetworkID]; network != nil {
			if err = n.addOwnershipLocked(network, certificate); err == nil {
				trustedNetworks[network] = struct{}{}
			} else {
				deferMissing(network, err)
				if !errors.Is(err, ErrUnknownPeer) {
					n.traceCredentialRejectedLocked(network, CredentialTypeOwnership, certificate.ID, certificate.Timestamp, certificate.IssuedTo, err.Error())
				}
			}
		}
	}
	if pos != len(payload) {
		return ErrInvalidPacket
	}
	return finish(true)
}

// deferCredentialsLocked queues credential data until missing identity is known.
func (n *Node) deferCredentialsLocked(missing, sender Address, payload []byte, now time.Time) {
	count := 0
	for _, packets := range n.deferredCredentials {
		count += len(packets)
	}
	if count >= maxDeferredCredentials {
		return
	}
	for _, packet := range n.deferredCredentials[missing] {
		if packet.sender == sender && bytes.Equal(packet.payload, payload) {
			return
		}
	}
	n.deferredCredentials[missing] = append(n.deferredCredentials[missing], deferredCredentialPacket{
		sender:   sender,
		payload:  append([]byte(nil), payload...),
		received: now,
	})
}

// retryDeferredCredentialsLocked retries credentials blocked on address.
func (n *Node) retryDeferredCredentialsLocked(address Address) {
	packets := n.deferredCredentials[address]
	delete(n.deferredCredentials, address)
	now := time.Now()
	for _, packet := range packets {
		if now.Sub(packet.received) > deferredCredentialExpiration {
			continue
		}
		if sender := n.peers[packet.sender]; sender != nil {
			_ = n.handleNetworkCredentialsPayloadLocked(sender, packet.payload, now)
		}
	}
}

// addRevocationLocked validates, installs, and optionally propagates revocation.
func (n *Node) addRevocationLocked(network *Network, sentFrom Address, revocation Revocation) error {
	controller := n.peers[Controller(network.ID)]
	if controller == nil {
		return ErrUnknownPeer
	}
	if revocation.NetworkID != network.ID || !revocation.Verify(controller.identity) {
		return ErrInvalidPacket
	}
	thresholds := network.revocations[revocation.Target]
	if thresholds == nil {
		thresholds = make(map[uint64]uint64)
		network.revocations[revocation.Target] = thresholds
	}
	key := credentialKey(revocation.Type, revocation.CredentialID)
	if thresholds[key] >= revocation.Threshold {
		return nil
	}
	thresholds[key] = revocation.Threshold
	// ZeroTier One invalidates the target's current membership whenever any
	// credential is revoked. A fresh COM proves the target reauthenticated
	// after the controller's revocation threshold.
	comKey := credentialKey(CredentialTypeCOM, 0)
	if thresholds[comKey] < revocation.Threshold {
		thresholds[comKey] = revocation.Threshold
	}
	network.removeRevokedCredentials(revocation)
	if revocation.FastPropagate() {
		n.propagateRevocationLocked(network, sentFrom, revocation)
	}
	return nil
}

// removeRevokedCredentials removes all installed credentials matched by
// revocation.
func (network *Network) removeRevokedCredentials(revocation Revocation) {
	switch revocation.Type {
	case CredentialTypeCOM:
		if certificate, ok := network.members[revocation.Target]; ok && certificate.Timestamp() <= revocation.Threshold {
			delete(network.members, revocation.Target)
		}
	case CredentialTypeCapability:
		network.capabilities[revocation.Target] = removeRevokedCapability(network.capabilities[revocation.Target], revocation)
	case CredentialTypeTag:
		network.tags[revocation.Target] = removeRevokedTag(network.tags[revocation.Target], revocation)
	case CredentialTypeOwnership:
		network.ownership[revocation.Target] = removeRevokedOwnership(network.ownership[revocation.Target], revocation)
	}
}

// propagateRevocationLocked sends a fast-propagating revocation to other peers.
func (n *Node) propagateRevocationLocked(network *Network, sentFrom Address, revocation Revocation) {
	for address := range networkCredentialRecipients(network) {
		if address == sentFrom || address == revocation.SignedBy || address == n.identity.Address() {
			continue
		}
		peer := n.peers[address]
		if peer == nil {
			continue
		}
		packet, err := NewPacket(address, n.identity.Address(), VerbNetworkCredentials)
		if err != nil {
			continue
		}
		_ = packet.Append(0)
		_ = packet.AppendUint16(0)
		_ = packet.AppendUint16(0)
		_ = packet.AppendUint16(1)
		_ = packet.Append(revocation.appendBinary(nil)...)
		_ = packet.AppendUint16(0)
		_ = n.sendPacketLocked(peer, packet, true)
	}
}

// networkCredentialRecipients returns peers eligible to receive network
// credentials proactively.
func networkCredentialRecipients(network *Network) map[Address]struct{} {
	recipients := make(map[Address]struct{}, len(network.members)+len(network.capabilities)+len(network.tags)+len(network.ownership)+len(network.associated))
	for address := range network.associated {
		recipients[address] = struct{}{}
	}
	for address := range network.members {
		recipients[address] = struct{}{}
	}
	for address := range network.capabilities {
		recipients[address] = struct{}{}
	}
	for address := range network.tags {
		recipients[address] = struct{}{}
	}
	for address := range network.ownership {
		recipients[address] = struct{}{}
	}
	for _, address := range network.Config.specialistAddresses(specialistTypeActiveBridge | specialistTypeMulticastReplicator | specialistTypeNetworkRelay) {
		recipients[address] = struct{}{}
	}
	return recipients
}

// credentialRevoked reports whether a matching revocation supersedes a
// credential timestamp.
func (network *Network) credentialRevoked(target Address, credentialType CredentialType, id uint32, timestamp uint64) bool {
	thresholds := network.revocations[target]
	if thresholds == nil {
		return false
	}
	if threshold, ok := thresholds[credentialKey(credentialType, id)]; ok && timestamp <= threshold {
		return true
	}
	if id != 0 {
		if threshold, ok := thresholds[credentialKey(credentialType, 0)]; ok && timestamp <= threshold {
			return true
		}
	}
	return false
}

// cleanRemoteCredentials removes credentials whose peer association is gone.
func (network *Network) cleanRemoteCredentials() {
	for target, capabilities := range network.capabilities {
		kept := capabilities[:0]
		for _, capability := range capabilities {
			if absoluteDifference(capability.Timestamp, network.Config.Timestamp) <= network.Config.CredentialTimeMaxDelta &&
				!network.credentialRevoked(target, CredentialTypeCapability, capability.ID, capability.Timestamp) {
				kept = append(kept, capability)
			}
		}
		if len(kept) == 0 {
			delete(network.capabilities, target)
		} else {
			network.capabilities[target] = kept
		}
	}
	for target, tags := range network.tags {
		kept := tags[:0]
		for _, tag := range tags {
			if absoluteDifference(tag.Timestamp, network.Config.Timestamp) <= network.Config.CredentialTimeMaxDelta &&
				!network.credentialRevoked(target, CredentialTypeTag, tag.ID, tag.Timestamp) {
				kept = append(kept, tag)
			}
		}
		if len(kept) == 0 {
			delete(network.tags, target)
		} else {
			network.tags[target] = kept
		}
	}
	for target, certificates := range network.ownership {
		kept := certificates[:0]
		for _, certificate := range certificates {
			if absoluteDifference(certificate.Timestamp, network.Config.Timestamp) <= network.Config.CredentialTimeMaxDelta &&
				!network.credentialRevoked(target, CredentialTypeOwnership, certificate.ID, certificate.Timestamp) {
				kept = append(kept, certificate)
			}
		}
		if len(kept) == 0 {
			delete(network.ownership, target)
		} else {
			network.ownership[target] = kept
		}
	}
}

// credentialKey combines a credential type and identifier for deduplication.
func credentialKey(credentialType CredentialType, id uint32) uint64 {
	return uint64(credentialType)<<32 | uint64(id)
}

// removeRevokedCapability removes capabilities matched by revocation.
func removeRevokedCapability(values []Capability, revocation Revocation) []Capability {
	result := values[:0]
	for _, value := range values {
		if (revocation.CredentialID != 0 && value.ID != revocation.CredentialID) || value.Timestamp > revocation.Threshold {
			result = append(result, value)
		}
	}
	return result
}

// removeRevokedTag removes tags matched by revocation.
func removeRevokedTag(values []Tag, revocation Revocation) []Tag {
	result := values[:0]
	for _, value := range values {
		if (revocation.CredentialID != 0 && value.ID != revocation.CredentialID) || value.Timestamp > revocation.Threshold {
			result = append(result, value)
		}
	}
	return result
}

// removeRevokedOwnership removes ownership certificates matched by revocation.
func removeRevokedOwnership(values []CertificateOfOwnership, revocation Revocation) []CertificateOfOwnership {
	result := values[:0]
	for _, value := range values {
		if (revocation.CredentialID != 0 && value.ID != revocation.CredentialID) || value.Timestamp > revocation.Threshold {
			result = append(result, value)
		}
	}
	return result
}

// addCapabilityLocked validates and installs one delegated capability.
func (n *Node) addCapabilityLocked(network *Network, capability Capability, sender Address, received time.Time) error {
	target := capability.IssuedTo()
	if capability.NetworkID != network.ID || target.IsZero() {
		return ErrInvalidPacket
	}
	if network.credentialRevoked(target, CredentialTypeCapability, capability.ID, capability.Timestamp) {
		return ErrInvalidPacket
	}
	missing, valid := capability.verify(func(address Address) (Identity, bool) {
		known := n.peers[address]
		if known == nil {
			return Identity{}, false
		}
		return known.identity, true
	})
	if !valid {
		if !missing.IsZero() {
			n.deferCapabilityLocked(missing, network.ID, capability, sender, received)
			n.requestWhoisLocked(missing, time.Now())
			return ErrUnknownPeer
		}
		return ErrInvalidPacket
	}
	capabilities := network.capabilities[target]
	for i, existing := range capabilities {
		if existing.ID == capability.ID {
			if capability.Timestamp < existing.Timestamp {
				return ErrInvalidPacket
			}
			capabilities[i] = capability
			network.capabilities[target] = capabilities
			return nil
		}
	}
	if len(capabilities) >= maxNetworkCapabilities {
		return ErrInvalidPacket
	}
	network.capabilities[target] = append(capabilities, capability)
	return nil
}

// addTagLocked validates and installs one network tag.
func (n *Node) addTagLocked(network *Network, tag Tag) error {
	controller := n.peers[Controller(network.ID)]
	if controller == nil {
		return ErrUnknownPeer
	}
	if tag.NetworkID != network.ID || tag.IssuedTo.IsZero() || !tag.Verify(controller.identity) {
		return ErrInvalidPacket
	}
	if network.credentialRevoked(tag.IssuedTo, CredentialTypeTag, tag.ID, tag.Timestamp) {
		return ErrInvalidPacket
	}
	tags := network.tags[tag.IssuedTo]
	for i, existing := range tags {
		if existing.ID == tag.ID {
			if tag.Timestamp < existing.Timestamp {
				return ErrInvalidPacket
			}
			tags[i] = tag
			network.tags[tag.IssuedTo] = tags
			return nil
		}
	}
	if len(tags) >= maxNetworkTags {
		return ErrInvalidPacket
	}
	network.tags[tag.IssuedTo] = append(tags, tag)
	return nil
}

// addOwnershipLocked validates and installs one ownership certificate.
func (n *Node) addOwnershipLocked(network *Network, certificate CertificateOfOwnership) error {
	controller := n.peers[Controller(network.ID)]
	if controller == nil {
		return ErrUnknownPeer
	}
	if certificate.NetworkID != network.ID || certificate.IssuedTo.IsZero() || !certificate.Verify(controller.identity) {
		return ErrInvalidPacket
	}
	if network.credentialRevoked(certificate.IssuedTo, CredentialTypeOwnership, certificate.ID, certificate.Timestamp) {
		return ErrInvalidPacket
	}
	certificates := network.ownership[certificate.IssuedTo]
	for i, existing := range certificates {
		if existing.ID == certificate.ID {
			if certificate.Timestamp < existing.Timestamp {
				return ErrInvalidPacket
			}
			certificates[i] = certificate
			network.ownership[certificate.IssuedTo] = certificates
			return nil
		}
	}
	if len(certificates) >= maxOwnershipCerts {
		return ErrInvalidPacket
	}
	network.ownership[certificate.IssuedTo] = append(certificates, certificate)
	return nil
}

// addMembershipLocked validates and installs one membership certificate.
func (n *Node) addMembershipLocked(network *Network, certificate CertificateOfMembership) error {
	controller := n.peers[Controller(network.ID)]
	if controller == nil {
		return ErrUnknownPeer
	}
	target := certificate.IssuedTo()
	if certificate.NetworkID() != network.ID || target.IsZero() || !certificate.Verify(controller.identity) {
		return ErrInvalidPacket
	}
	if network.credentialRevoked(target, CredentialTypeCOM, 0, certificate.Timestamp()) {
		return ErrInvalidPacket
	}
	if existing, ok := network.members[target]; ok && certificate.Timestamp() < existing.Timestamp() {
		return ErrInvalidPacket
	}
	network.members[target] = certificate
	return nil
}

// allows reports whether peer has valid membership in network.
func (network *Network) allows(peer *peer) bool {
	if network.Config.Type == NetworkTypePublic {
		return true
	}
	certificate, ok := network.members[peer.identity.Address()]
	return ok && !network.credentialRevoked(peer.identity.Address(), CredentialTypeCOM, 0, certificate.Timestamp()) &&
		network.Config.COM != nil && network.Config.COM.agreesWithPublicKeyHash(certificate, peer.publicKeyHash)
}

// deferCapabilityLocked queues a capability until a signer identity is known.
func (n *Node) deferCapabilityLocked(missing Address, networkID uint64, capability Capability, sender Address, received time.Time) {
	count := 0
	for _, values := range n.deferredCapabilities {
		count += len(values)
	}
	if count >= maxDeferredCapabilities {
		return
	}
	for _, deferred := range n.deferredCapabilities[missing] {
		if deferred.networkID == networkID && deferred.value.ID == capability.ID && deferred.value.Timestamp == capability.Timestamp && deferred.value.IssuedTo() == capability.IssuedTo() && deferred.sender == sender {
			return
		}
	}
	n.deferredCapabilities[missing] = append(n.deferredCapabilities[missing], deferredCapability{networkID: networkID, value: capability, sender: sender, received: received})
}

// retryDeferredCapabilitiesLocked retries capabilities blocked on address.
func (n *Node) retryDeferredCapabilitiesLocked(address Address) {
	values := n.deferredCapabilities[address]
	delete(n.deferredCapabilities, address)
	now := time.Now()
	for _, deferred := range values {
		if now.Sub(deferred.received) > deferredCredentialExpiration {
			continue
		}
		if network := n.networks[deferred.networkID]; network != nil {
			if err := n.addCapabilityLocked(network, deferred.value, deferred.sender, deferred.received); err == nil && !deferred.sender.IsZero() {
				if sender := n.peers[deferred.sender]; sender != nil {
					n.markNetworkTrustLocked(network, sender, now)
				}
			}
		}
	}
}

// sendNeedCredentialsLocked reports credentials required to process request.
func (n *Node) sendNeedCredentialsLocked(peer *peer, path pathKey, request *Packet, networkID uint64) error {
	packet, err := NewPacket(peer.identity.Address(), n.identity.Address(), VerbError)
	if err != nil {
		return err
	}
	_ = packet.Append(byte(request.Verb()))
	_ = packet.AppendUint64(request.PacketID())
	_ = packet.Append(0x06)
	_ = packet.AppendUint64(networkID)
	return n.sendPacketViaPathLocked(peer, packet, true, path, false)
}

// deliverFrameLocked schedules a core-owned frame outside the node lock. Its
// payload remains valid if the callback retains it.
func (n *Node) deliverFrameLocked(frame Frame) {
	if callback := n.onFrame; callback != nil {
		n.queueDataCallbackLocked(dataCallback{
			kind:        dataCallbackFrame,
			callback:    callback,
			id:          frame.NetworkID,
			origin:      uint64(frame.Source),
			destination: uint64(frame.Destination),
			etherType:   frame.EtherType,
			payload:     frame.Payload,
		})
	}
}

// pendingFramesCountLocked returns all unicast frames awaiting peer discovery.
func (n *Node) pendingFramesCountLocked() int {
	count := 0
	for _, frames := range n.pendingFrames {
		count += len(frames)
	}
	return count
}

// enqueuePendingFrameLocked retains a frame for peer discovery. At capacity it
// replaces the oldest frame, matching the official transmit ring's loss model:
// temporary discovery pressure remains packet loss instead of becoming a
// virtual-device write error that can abort the originating socket.
func (n *Node) enqueuePendingFrameLocked(destination Address, pending pendingOutboundFrame) {
	if n.pendingFramesCountLocked() >= maxPendingFrames {
		var oldestAddress Address
		oldestIndex := -1
		var oldest time.Time
		for address, frames := range n.pendingFrames {
			for index, frame := range frames {
				if oldestIndex < 0 || frame.createdAt.Before(oldest) || frame.createdAt.Equal(oldest) && (address < oldestAddress || address == oldestAddress && index < oldestIndex) {
					oldestAddress, oldestIndex, oldest = address, index, frame.createdAt
				}
			}
		}
		if oldestIndex >= 0 {
			frames := n.pendingFrames[oldestAddress]
			copy(frames[oldestIndex:], frames[oldestIndex+1:])
			frames[len(frames)-1] = pendingOutboundFrame{}
			frames = frames[:len(frames)-1]
			if len(frames) == 0 {
				delete(n.pendingFrames, oldestAddress)
			} else {
				n.pendingFrames[oldestAddress] = frames
			}
		}
	}
	pending.frame.Payload = append([]byte(nil), pending.frame.Payload...)
	n.pendingFrames[destination] = append(n.pendingFrames[destination], pending)
}

// multicastGroupForFrame derives ZeroTier's multicast group and ADI from frame.
func multicastGroupForFrame(frame Frame) MulticastGroup {
	group := MulticastGroup{MAC: frame.Destination}
	if frame.Destination.IsBroadcast() && frame.EtherType == EtherTypeARP && len(frame.Payload) >= 28 &&
		binary.BigEndian.Uint16(frame.Payload[2:4]) == EtherTypeIPv4 && frame.Payload[4] == EthernetMACSize && frame.Payload[5] == 4 && frame.Payload[7] == 1 {
		group.ADI = binary.BigEndian.Uint32(frame.Payload[24:28])
	}
	return group
}

// sendMulticastLocked selects known recipients or starts member discovery.
func (n *Node) sendMulticastLocked(network *Network, frame Frame, now time.Time) error {
	group := multicastGroupForFrame(frame)
	if group.MAC.IsBroadcast() && group.ADI == 0 && network.Config.Flags&NetworkConfigFlagEnableBroadcast == 0 {
		n.traceOutgoingFrameDropLocked(network, frame, "broadcast disabled")
		return ErrUnsupportedEthernet
	}
	if network.Config.MulticastLimit == 0 {
		n.traceOutgoingFrameDropLocked(network, frame, "multicast disabled")
		return ErrUnsupportedEthernet
	}
	if !network.Config.isSpecialist(n.identity.Address(), specialistTypeActiveBridge) &&
		!network.Config.isSpecialist(n.identity.Address(), specialistTypeMulticastReplicator) {
		if peer := n.bestMulticastReplicatorLocked(network, now); peer != nil {
			if err := n.sendMulticastFrameLocked(network, peer, group, frame, 0, true, now); err == nil {
				return nil
			}
		}
	}
	return n.sendMulticastSenderLocked(network, 0, group, frame, now)
}

// sendMulticastSenderLocked sends or replicates multicast on behalf of origin.
func (n *Node) sendMulticastSenderLocked(network *Network, origin Address, group MulticastGroup, frame Frame, now time.Time) error {
	members := network.multicast[group]
	limit := effectiveMulticastLimit(network.Config.MulticastLimit)
	memberCount := 0
	for address, seen := range members {
		if address != n.identity.Address() && now.Sub(seen) < multicastMemberExpiration {
			memberCount++
		}
	}
	bridgesOutsideLimit := memberCount >= limit
	gatherLimit := uint32(1)
	if !bridgesOutsideLimit {
		gatherLimit = uint32(limit - memberCount + 1)
	}
	bridges := network.Config.specialistAddresses(specialistTypeActiveBridge)
	bridgeSet := make(map[Address]struct{}, len(bridges))
	sentTo := make(map[Address]struct{}, limit+len(bridges))
	var fixedTargets map[Address]struct{}
	if bridgesOutsideLimit {
		fixedTargets = make(map[Address]struct{}, limit+len(bridges))
	}
	for _, address := range bridges {
		bridgeSet[address] = struct{}{}
		if address == n.identity.Address() || address == origin || (!bridgesOutsideLimit && len(sentTo) >= limit) {
			continue
		}
		if fixedTargets != nil {
			fixedTargets[address] = struct{}{}
		}
		peer := n.peers[address]
		if peer == nil {
			n.requestWhoisLocked(address, now)
			continue
		}
		if err := n.sendMulticastFrameLocked(network, peer, group, frame, gatherLimit, false, now); err != nil {
			continue
		}
		sentTo[address] = struct{}{}
	}
	memberSent := 0
	memberSelected := 0
	for address, seen := range members {
		if address == origin || now.Sub(seen) >= multicastMemberExpiration ||
			(bridgesOutsideLimit && memberSelected >= limit) || (!bridgesOutsideLimit && (memberSent >= limit || len(sentTo) >= limit)) {
			continue
		}
		if _, isBridge := bridgeSet[address]; isBridge {
			continue
		}
		if fixedTargets != nil {
			memberSelected++
			fixedTargets[address] = struct{}{}
		}
		peer := n.peers[address]
		if peer == nil {
			n.requestWhoisLocked(address, now)
			continue
		}
		if err := n.sendMulticastFrameLocked(network, peer, group, frame, gatherLimit, false, now); err != nil {
			continue
		}
		sentTo[address] = struct{}{}
		memberSent++
	}
	complete := len(sentTo) >= limit
	if bridgesOutsideLimit {
		complete = true
		for address := range fixedTargets {
			_, sent := sentTo[address]
			complete = complete && sent
		}
	}
	if !complete && len(network.pendingMulticast[group]) < maxPendingMulticastGroup && n.pendingMulticastCountLocked() < maxPendingFrames {
		frame.Payload = append([]byte(nil), frame.Payload...)
		network.pendingMulticast[group] = append(network.pendingMulticast[group], pendingMulticastFrame{
			frame: frame, origin: origin, sent: sentTo, targets: fixedTargets, gatherLimit: gatherLimit, bridgesOutsideLimit: bridgesOutsideLimit, createdAt: now,
		})
	}
	if bridgesOutsideLimit {
		return nil
	}
	return n.gatherMulticastLocked(network, group, gatherLimit, now)
}

// pendingMulticastCountLocked returns queued frames and gather operations.
func (n *Node) pendingMulticastCountLocked() int {
	count := 0
	for _, network := range n.networks {
		for _, pending := range network.pendingMulticast {
			count += len(pending)
		}
	}
	return count
}

// effectiveMulticastLimit converts the configured limit to a bounded host int.
func effectiveMulticastLimit(limit uint32) int {
	if limit > maxMulticastGroupMembers {
		return maxMulticastGroupMembers
	}
	return int(limit)
}

// bestMulticastReplicatorLocked selects the best reachable configured
// replicator.
func (n *Node) bestMulticastReplicatorLocked(network *Network, now time.Time) *peer {
	var best *peer
	bestQuality := time.Duration(1<<63 - 1)
	for _, address := range network.Config.specialistAddresses(specialistTypeMulticastReplicator) {
		peer := n.peers[address]
		if peer == nil {
			continue
		}
		pathKey := n.bestDirectPeerPathLocked(peer, now)
		if !pathKey.endpoint.IsValid() {
			continue
		}
		quality := pathLatency(peer.paths[pathKey])
		if best == nil || quality < bestQuality {
			best, bestQuality = peer, quality
		}
	}
	return best
}

// sendMulticastFrameLocked encodes and sends one multicast frame operation.
func (n *Node) sendMulticastFrameLocked(network *Network, peer *peer, group MulticastGroup, frame Frame, gatherLimit uint32, replicate bool, now time.Time) error {
	// A designated replicator is a transport hop, not a multicast receiver.
	// Final destinations are filtered when the replicator fans the frame out.
	if !replicate {
		send, err := n.filterReplicatedOutboundLocked(network, peer.identity.Address(), frame, now)
		if err != nil || !send {
			return err
		}
	}
	if err := n.sendCredentialsLocked(network, peer, now); err != nil {
		return err
	}
	packet, err := NewPacket(peer.identity.Address(), n.identity.Address(), VerbMulticastFrame)
	if err != nil {
		return err
	}
	_ = packet.AppendUint64(network.ID)
	flags := byte(0)
	if gatherLimit > 0 {
		flags |= 0x02
	}
	derivedSource := MACForAddress(n.identity.Address(), network.ID)
	if replicate || frame.Source != derivedSource {
		flags |= 0x04
	}
	if replicate {
		flags |= 0x08
	}
	_ = packet.Append(flags)
	if gatherLimit > 0 {
		_ = packet.AppendUint32(gatherLimit)
	}
	if flags&0x04 != 0 {
		source := frame.Source.Bytes()
		_ = packet.Append(source[:]...)
	}
	mac := group.MAC.Bytes()
	_ = packet.Append(mac[:]...)
	_ = packet.AppendUint32(group.ADI)
	_ = packet.AppendUint16(frame.EtherType)
	_ = packet.Append(frame.Payload...)
	if gatherLimit > 0 {
		if err := n.addPendingLocked(packet.PacketID(), pendingRequest{verb: VerbMulticastFrame, peer: peer.identity.Address(), networkID: network.ID, sentAt: now}); err != nil {
			return err
		}
	}
	if err := packet.Compress(); err != nil {
		n.deletePendingLocked(packet.PacketID())
		return err
	}
	if err := n.sendPacketWithFlowLocked(peer, packet, true, frameFlowID(frame)); err != nil {
		n.deletePendingLocked(packet.PacketID())
		return err
	}
	return nil
}

// gatherMulticastLocked requests current members for group from a root or
// replicator.
func (n *Node) gatherMulticastLocked(network *Network, group MulticastGroup, limit uint32, now time.Time) error {
	gatherPeriod := multicastExplicitGather
	if n.lowBandwidth {
		gatherPeriod *= 3
	}
	if last := network.lastMulticastGather[group]; len(network.multicast[group]) != 0 && !last.IsZero() && now.Sub(last) < gatherPeriod {
		return nil
	}
	network.lastMulticastGather[group] = now
	addresses := make([]Address, 0, 18)
	if hub, ok := adHocNetworkHub(network.ID); ok {
		addresses = append(addresses, hub)
	} else {
		addresses = append(addresses, Controller(network.ID))
	}
	if root, _ := n.bestRootLocked(); root != nil && root.identity.Address() != addresses[0] {
		addresses = append(addresses, root.identity.Address())
	}
	specialists := network.Config.specialistAddresses(specialistTypeNetworkRelay | specialistTypeMulticastReplicator)
	shuffleAddresses(specialists)
	for _, address := range specialists {
		if len(addresses) >= 16 {
			break
		}
		addresses = append(addresses, address)
	}
	seenAddresses := make(map[Address]struct{}, len(addresses))
	var firstErr error
	for _, address := range addresses {
		if address == n.identity.Address() {
			continue
		}
		if _, exists := seenAddresses[address]; exists {
			continue
		}
		seenAddresses[address] = struct{}{}
		packet, err := NewPacket(address, n.identity.Address(), VerbMulticastGather)
		if err != nil {
			return err
		}
		_ = packet.AppendUint64(network.ID)
		flags := byte(0)
		if network.Config.COM != nil {
			flags = 1
		}
		_ = packet.Append(flags)
		mac := group.MAC.Bytes()
		_ = packet.Append(mac[:]...)
		_ = packet.AppendUint32(group.ADI)
		_ = packet.AppendUint32(limit)
		if network.Config.COM != nil {
			_ = packet.Append(network.Config.COM.raw...)
		}
		if err := n.addPendingLocked(packet.PacketID(), pendingRequest{verb: VerbMulticastGather, peer: address, networkID: network.ID, sentAt: now}); err != nil {
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		peer := n.peers[address]
		if peer == nil {
			n.enqueuePendingTransmitLocked(packet, true, noFlowID, now)
			n.requestWhoisLocked(address, now)
			continue
		}
		if err := n.sendPacketLocked(peer, packet, true); err != nil {
			n.deletePendingLocked(packet.PacketID())
			if firstErr == nil {
				firstErr = err
			}
		}
	}
	return firstErr
}

// handleMulticastGatherOKLocked applies members returned by a gather request.
func (n *Node) handleMulticastGatherOKLocked(payload []byte, now time.Time) error {
	if len(payload) < 33 {
		return ErrInvalidPacket
	}
	networkID := binary.BigEndian.Uint64(payload[9:17])
	network := n.networks[networkID]
	if network == nil {
		return nil
	}
	mac, err := MACFromBytes(payload[17:23])
	if err != nil {
		return err
	}
	group := MulticastGroup{MAC: mac, ADI: binary.BigEndian.Uint32(payload[23:27])}
	return n.addMulticastGatherResultsLocked(network, group, payload[27:], now)
}

// handleMulticastFrameOKLocked applies gather results piggybacked on a frame
// acknowledgement.
func (n *Node) handleMulticastFrameOKLocked(peer *peer, payload []byte, now time.Time) error {
	if len(payload) < 28 {
		return ErrInvalidPacket
	}
	networkID := binary.BigEndian.Uint64(payload[9:17])
	network := n.networks[networkID]
	if network == nil {
		return nil
	}
	mac, err := MACFromBytes(payload[17:23])
	if err != nil {
		return err
	}
	group := MulticastGroup{MAC: mac, ADI: binary.BigEndian.Uint32(payload[23:27])}
	flags := payload[27]
	pos := 28
	if flags&0x01 != 0 {
		certificate, consumed, err := ParseCertificateOfMembership(payload[pos:])
		if err != nil {
			return err
		}
		_ = n.addMembershipLocked(network, certificate)
		pos += consumed
	}
	if flags&0x02 == 0 {
		return nil
	}
	return n.addMulticastGatherResultsLocked(network, group, payload[pos:], now)
}

// addMulticastGatherResultsLocked records authenticated member addresses.
func (n *Node) addMulticastGatherResultsLocked(network *Network, group MulticastGroup, results []byte, now time.Time) error {
	if len(results) < 6 {
		return ErrInvalidPacket
	}
	count := int(binary.BigEndian.Uint16(results[4:6]))
	if len(results)-6 < count*AddressSize {
		return ErrInvalidPacket
	}
	members := n.ensureMulticastGroupLocked(network, group)
	if members == nil {
		return nil
	}
	for pos, i := 6, 0; i < count; i, pos = i+1, pos+AddressSize {
		address, err := AddressFromBytes(results[pos : pos+AddressSize])
		if err != nil {
			return err
		}
		if address != n.identity.Address() {
			if _, exists := members[address]; exists || len(members) < maxMulticastGroupMembers {
				members[address] = now
			}
			if n.peers[address] == nil {
				n.requestWhoisLocked(address, now)
			}
		}
	}
	n.flushPendingMulticastLocked(network, group, now)
	return nil
}

// handleMulticastLikeLocked records a peer's multicast subscription announcement.
func (n *Node) handleMulticastLikeLocked(peer *peer, packet *Packet, now time.Time) error {
	payload := packet.Payload()
	if len(payload)%18 != 0 {
		return ErrInvalidPacket
	}
	for pos := 0; pos < len(payload); pos += 18 {
		networkID := binary.BigEndian.Uint64(payload[pos:])
		network := n.networks[networkID]
		if network == nil || !network.allows(peer) {
			continue
		}
		n.markNetworkTrustLocked(network, peer, now)
		mac, err := MACFromBytes(payload[pos+8 : pos+14])
		if err != nil || !mac.IsMulticast() {
			continue
		}
		group := MulticastGroup{MAC: mac, ADI: binary.BigEndian.Uint32(payload[pos+14:])}
		members := n.ensureMulticastGroupLocked(network, group)
		if members == nil {
			continue
		}
		if _, exists := members[peer.identity.Address()]; exists || len(members) < maxMulticastGroupMembers {
			members[peer.identity.Address()] = now
		}
		n.flushPendingMulticastLocked(network, group, now)
	}
	return nil
}

// handleMulticastGatherLocked answers a peer's multicast member request.
func (n *Node) handleMulticastGatherLocked(path pathKey, peer *peer, packet *Packet, now time.Time) error {
	payload := packet.Payload()
	if len(payload) < 23 {
		return ErrInvalidPacket
	}
	networkID := binary.BigEndian.Uint64(payload)
	network := n.networks[networkID]
	if network == nil {
		return nil
	}
	flags := payload[8]
	mac, err := MACFromBytes(payload[9:15])
	if err != nil {
		return ErrInvalidPacket
	}
	group := MulticastGroup{MAC: mac, ADI: binary.BigEndian.Uint32(payload[15:19])}
	limit := binary.BigEndian.Uint32(payload[19:23])
	if flags&0x01 != 0 {
		certificate, _, err := ParseCertificateOfMembership(payload[23:])
		if err == nil {
			_ = n.addMembershipLocked(network, certificate)
		}
	}
	if !network.allows(peer) {
		n.traceNetworkAccessDeniedLocked(network, path, packet)
		return nil
	}
	n.markNetworkTrustLocked(network, peer, now)
	if limit == 0 {
		return nil
	}
	total, addresses := n.gatherMulticastMembersLocked(network, group, peer.identity.Address(), limit, now)
	if len(addresses) == 0 {
		return nil
	}
	reply, err := NewPacket(peer.identity.Address(), n.identity.Address(), VerbOK)
	if err != nil {
		return err
	}
	_ = reply.Append(byte(VerbMulticastGather))
	_ = reply.AppendUint64(packet.PacketID())
	_ = reply.AppendUint64(networkID)
	groupMAC := group.MAC.Bytes()
	_ = reply.Append(groupMAC[:]...)
	_ = reply.AppendUint32(group.ADI)
	_ = reply.AppendUint32(total)
	_ = reply.AppendUint16(uint16(len(addresses)))
	for _, address := range addresses {
		bytes := address.Bytes()
		_ = reply.Append(bytes[:]...)
	}
	_ = n.sendPacketViaPathLocked(peer, reply, true, path, false)
	return nil
}

// handleMulticastFrameLocked validates, delivers, and optionally replicates an
// inbound multicast frame.
func (n *Node) handleMulticastFrameLocked(path pathKey, peer *peer, packet *Packet, now time.Time) error {
	payload := packet.Payload()
	if len(payload) < 9 {
		return ErrInvalidPacket
	}
	networkID := binary.BigEndian.Uint64(payload)
	network := n.networks[networkID]
	if network == nil {
		return errPacketNotAccepted
	}
	flags := payload[8]
	pos := 9
	if flags&0x01 != 0 {
		certificate, consumed, err := ParseCertificateOfMembership(payload[pos:])
		if err != nil {
			return err
		}
		pos += consumed
		_ = n.addMembershipLocked(network, certificate)
	}
	if !network.allows(peer) {
		_ = n.sendNeedCredentialsLocked(peer, path, packet, networkID)
		n.traceNetworkAccessDeniedLocked(network, path, packet)
		return errPacketRetry
	}
	gatherLimit := uint32(0)
	if flags&0x02 != 0 {
		if len(payload)-pos < 4 {
			return ErrInvalidPacket
		}
		gatherLimit = binary.BigEndian.Uint32(payload[pos:])
		pos += 4
	}
	source := MACForAddress(peer.identity.Address(), networkID)
	if flags&0x04 != 0 {
		if len(payload)-pos < EthernetMACSize {
			return ErrInvalidPacket
		}
		var err error
		source, err = MACFromBytes(payload[pos : pos+6])
		if err != nil {
			return err
		}
		pos += 6
	}
	if len(payload)-pos < 12 {
		return ErrInvalidPacket
	}
	destination, err := MACFromBytes(payload[pos : pos+6])
	if err != nil {
		return ErrInvalidPacket
	}
	pos += 10 // destination MAC and ADI
	frame := Frame{NetworkID: networkID, Source: source, Destination: destination, EtherType: binary.BigEndian.Uint16(payload[pos:]), Payload: payload[pos+2:]}
	group := MulticastGroup{MAC: destination, ADI: binary.BigEndian.Uint32(payload[pos-4 : pos])}
	if network.Config.MulticastLimit == 0 {
		n.traceIncomingFrameDropLocked(network, frame, path, packet, "multicast disabled")
		return nil
	}
	n.markNetworkTrustLocked(network, peer, now)
	if len(frame.Payload) == 0 || len(frame.Payload) > MaxNetworkMTU {
		if gatherLimit > 0 {
			_ = n.sendMulticastFrameGatherOKLocked(network, peer, path, packet.PacketID(), group, gatherLimit, now)
		}
		return nil
	}
	if !destination.IsMulticast() {
		n.traceInvalidPacketLocked(path.localSocket, path.endpoint, packet.Bytes(), "destination not multicast")
		return nil
	}
	if source.Uint64() == 0 || source.IsMulticast() {
		n.traceInvalidPacketLocked(path.localSocket, path.endpoint, packet.Bytes(), "invalid source MAC")
		return nil
	}
	if source == MACForAddress(n.identity.Address(), networkID) {
		n.traceInvalidPacketLocked(path.localSocket, path.endpoint, packet.Bytes(), "invalid source MAC")
		return nil
	}
	if source != MACForAddress(peer.identity.Address(), networkID) && !network.Config.isSpecialist(peer.identity.Address(), specialistTypeActiveBridge) {
		n.traceIncomingFrameDropLocked(network, frame, path, packet, "bridging not allowed (remote)")
		return nil
	}
	if source != MACForAddress(peer.identity.Address(), networkID) {
		n.learnBridgeRouteLocked(network, source, peer.identity.Address(), now)
	}
	if flags&0x08 != 0 && network.Config.isSpecialist(n.identity.Address(), specialistTypeMulticastReplicator) {
		n.replicateMulticastLocked(network, peer.identity.Address(), group, frame, now)
	}
	decision := network.Config.filterFrame(frame, frameRuleContext{
		inbound: true, sourceZT: peer.identity.Address(), destinationZT: n.identity.Address(), traceRules: n.traceRulesEnabledLocked(network),
		ownership: network.ownership[peer.identity.Address()], localTags: network.Config.Tags,
		remoteTags: network.tags[peer.identity.Address()], capabilities: network.capabilities[peer.identity.Address()],
	})
	n.traceNetworkFilterLocked(network, frame, peer.identity.Address(), n.identity.Address(), true, false, decision)
	if decision.result != ruleAccept {
		n.traceIncomingFrameDropLocked(network, frame, path, packet, "filter blocked")
		if gatherLimit > 0 {
			_ = n.sendMulticastFrameGatherOKLocked(network, peer, path, packet.PacketID(), group, gatherLimit, now)
		}
		return nil
	}
	if !n.applyInboundRuleEffectsLocked(network, decision, frame, now) {
		if gatherLimit > 0 {
			_ = n.sendMulticastFrameGatherOKLocked(network, peer, path, packet.PacketID(), group, gatherLimit, now)
		}
		return nil
	}
	n.deliverFrameLocked(frame)
	if gatherLimit > 0 {
		_ = n.sendMulticastFrameGatherOKLocked(network, peer, path, packet.PacketID(), group, gatherLimit, now)
	}
	return nil
}

// sendMulticastFrameGatherOKLocked acknowledges a frame with gathered members.
func (n *Node) sendMulticastFrameGatherOKLocked(network *Network, peer *peer, path pathKey, packetID uint64, group MulticastGroup, limit uint32, now time.Time) error {
	total, addresses := n.gatherMulticastMembersLocked(network, group, peer.identity.Address(), limit, now)
	if len(addresses) == 0 {
		return nil
	}
	reply, err := NewPacket(peer.identity.Address(), n.identity.Address(), VerbOK)
	if err != nil {
		return err
	}
	_ = reply.Append(byte(VerbMulticastFrame))
	_ = reply.AppendUint64(packetID)
	_ = reply.AppendUint64(network.ID)
	mac := group.MAC.Bytes()
	_ = reply.Append(mac[:]...)
	_ = reply.AppendUint32(group.ADI)
	_ = reply.Append(0x02)
	_ = reply.AppendUint32(total)
	_ = reply.AppendUint16(uint16(len(addresses)))
	for _, address := range addresses {
		bytes := address.Bytes()
		_ = reply.Append(bytes[:]...)
	}
	return n.sendPacketViaPathLocked(peer, reply, true, path, false)
}

// gatherMulticastMembersLocked selects eligible members up to limit.
func (n *Node) gatherMulticastMembersLocked(network *Network, group MulticastGroup, requester Address, limit uint32, now time.Time) (uint32, []Address) {
	members := network.multicast[group]
	addresses := make([]Address, 0, len(members)+1)
	if n.subscribedToMulticastGroupLocked(network, group) {
		addresses = append(addresses, n.identity.Address())
	}
	total := len(addresses)
	otherAddresses := make([]Address, 0, len(members))
	for address, seen := range members {
		if now.Sub(seen) >= multicastMemberExpiration {
			delete(members, address)
			continue
		}
		total++
		if address != requester && address != n.identity.Address() {
			otherAddresses = append(otherAddresses, address)
		}
	}
	shuffleAddresses(otherAddresses)
	addresses = append(addresses, otherAddresses...)
	maxResults := (MaxPacketSize - (PacketMinSize + 9 + 8 + 6 + 4 + 6)) / AddressSize
	if uint64(limit) < uint64(maxResults) {
		maxResults = int(limit)
	}
	if len(addresses) > maxResults {
		addresses = addresses[:maxResults]
	}
	return uint32(total), addresses
}

// shuffleAddresses randomizes peer selection order using crypto/rand.
func shuffleAddresses(addresses []Address) {
	var random [8]byte
	for i := len(addresses) - 1; i > 0; i-- {
		if _, err := rand.Read(random[:]); err != nil {
			return
		}
		j := int(binary.BigEndian.Uint64(random[:]) % uint64(i+1))
		addresses[i], addresses[j] = addresses[j], addresses[i]
	}
}

// replicateMulticastLocked forwards a multicast frame to selected members.
func (n *Node) replicateMulticastLocked(network *Network, origin Address, group MulticastGroup, frame Frame, now time.Time) {
	_ = n.sendMulticastSenderLocked(network, origin, group, frame, now)
}

// flushPendingMulticastLocked retries frames waiting for gathered membership.
func (n *Node) flushPendingMulticastLocked(network *Network, group MulticastGroup, now time.Time) {
	pending := network.pendingMulticast[group]
	if len(pending) == 0 {
		return
	}
	members := network.multicast[group]
	limit := effectiveMulticastLimit(network.Config.MulticastLimit)
	bridges := network.Config.specialistAddresses(specialistTypeActiveBridge)
	bridgeSet := make(map[Address]struct{}, len(bridges))
	for _, address := range bridges {
		bridgeSet[address] = struct{}{}
	}
	kept := pending[:0]
	for _, item := range pending {
		if now.Sub(item.createdAt) >= multicastTransmitTimeout {
			continue
		}
		if item.targets != nil {
			complete := true
			for address := range item.targets {
				if _, sent := item.sent[address]; sent {
					continue
				}
				complete = false
				peer := n.peers[address]
				if peer == nil {
					n.requestWhoisLocked(address, now)
					continue
				}
				if n.sendMulticastFrameLocked(network, peer, group, item.frame, item.gatherLimit, false, now) == nil {
					item.sent[address] = struct{}{}
				}
			}
			if !complete {
				complete = true
				for address := range item.targets {
					_, sent := item.sent[address]
					complete = complete && sent
				}
			}
			if !complete {
				kept = append(kept, item)
			}
			continue
		}
		for _, address := range bridges {
			if address == n.identity.Address() || address == item.origin || (!item.bridgesOutsideLimit && len(item.sent) >= limit) {
				continue
			}
			if _, sent := item.sent[address]; sent {
				continue
			}
			peer := n.peers[address]
			if peer == nil {
				n.requestWhoisLocked(address, now)
				continue
			}
			if n.sendMulticastFrameLocked(network, peer, group, item.frame, item.gatherLimit, false, now) == nil {
				item.sent[address] = struct{}{}
			}
		}
		memberSent := 0
		for address := range item.sent {
			if _, isBridge := bridgeSet[address]; !isBridge {
				memberSent++
			}
		}
		for address, seen := range members {
			if memberSent >= limit || (!item.bridgesOutsideLimit && len(item.sent) >= limit) {
				break
			}
			if address == item.origin {
				continue
			}
			if now.Sub(seen) >= multicastMemberExpiration {
				continue
			}
			if _, isBridge := bridgeSet[address]; isBridge {
				continue
			}
			if _, exists := item.sent[address]; exists {
				continue
			}
			peer := n.peers[address]
			if peer == nil {
				n.requestWhoisLocked(address, now)
				continue
			}
			if n.sendMulticastFrameLocked(network, peer, group, item.frame, item.gatherLimit, false, now) == nil {
				item.sent[address] = struct{}{}
				memberSent++
			}
		}
		complete := len(item.sent) >= limit
		if item.bridgesOutsideLimit {
			complete = memberSent >= limit
			for _, address := range bridges {
				if address != n.identity.Address() && address != item.origin {
					_, sent := item.sent[address]
					complete = complete && sent
				}
			}
		}
		if !complete {
			kept = append(kept, item)
		}
	}
	if len(kept) == 0 {
		delete(network.pendingMulticast, group)
	} else {
		network.pendingMulticast[group] = kept
	}
}

// announceMulticastLocked advertises current subscriptions to eligible peers.
func (n *Node) announceMulticastLocked(network *Network, now time.Time) {
	groups := n.subscribedMulticastGroupsLocked(network)
	addresses := []Address{Controller(network.ID)}
	for _, root := range n.allRootsLocked() {
		addresses = append(addresses, root.Identity.Address())
	}
	addresses = append(addresses, network.Config.specialistAddresses(specialistTypeNetworkRelay|specialistTypeMulticastReplicator)...)
	if len(groups) != 0 {
		for address := range network.members {
			if peer := n.peers[address]; peer != nil && network.allows(peer) {
				addresses = append(addresses, address)
			}
		}
	}
	for address, associatedAt := range network.associated {
		if now.Sub(associatedAt) < trustExpiration {
			addresses = append(addresses, address)
		}
	}
	seenAddresses := make(map[Address]struct{}, len(addresses))
	for _, address := range addresses {
		if address == n.identity.Address() {
			continue
		}
		if _, exists := seenAddresses[address]; exists {
			continue
		}
		seenAddresses[address] = struct{}{}
		peer := n.peers[address]
		if peer == nil {
			n.requestWhoisLocked(address, now)
			continue
		}
		n.announceMulticastToPeerLocked(network, peer, groups, now)
	}
}

// announceMulticastToPeerLocked sends subscription groups to one peer.
func (n *Node) announceMulticastToPeerLocked(network *Network, peer *peer, groups []MulticastGroup, now time.Time) {
	address := peer.identity.Address()
	if now.Sub(network.multicastAnnouncements[address]) < multicastLikePeriod {
		return
	}
	if n.sendCredentialsLocked(network, peer, now) != nil {
		return
	}
	if len(groups) == 0 {
		network.multicastAnnouncements[address] = now
		return
	}
	for offset := 0; offset < len(groups); {
		packet, err := NewPacket(address, n.identity.Address(), VerbMulticastLike)
		if err != nil {
			return
		}
		for offset < len(groups) && len(packet.Bytes())+18 <= MaxPacketSize {
			group := groups[offset]
			_ = packet.AppendUint64(network.ID)
			mac := group.MAC.Bytes()
			_ = packet.Append(mac[:]...)
			_ = packet.AppendUint32(group.ADI)
			offset++
		}
		if err = packet.Compress(); err != nil {
			return
		}
		if err = n.sendPacketLocked(peer, packet, true); err != nil {
			return
		}
	}
	network.multicastAnnouncements[address] = now
}

// filterReplicatedOutboundLocked applies outbound rules to a replicated frame.
func (n *Node) filterReplicatedOutboundLocked(network *Network, destination Address, frame Frame, now time.Time) (bool, error) {
	decision := network.Config.filterFrame(frame, frameRuleContext{
		sourceZT: n.identity.Address(), destinationZT: destination, traceRules: n.traceRulesEnabledLocked(network),
		ownership: network.Config.Ownership, localTags: network.Config.Tags,
		remoteTags: network.tags[destination], capabilities: network.Config.Capabilities,
	})
	n.traceNetworkFilterLocked(network, frame, n.identity.Address(), destination, false, true, decision)
	if decision.result != ruleAccept {
		n.traceOutgoingFrameDropLocked(network, frame, "filter blocked (replication)")
		return false, nil
	}
	if !decision.redirect.IsZero() {
		return false, n.sendRuleFrameWithFlowLocked(network, decision.redirect, frame, 0x04, 0, frameFlowID(frame), now)
	}
	return true, nil
}

// learnBridgeRouteLocked records the bridge last seen sourcing mac.
func (n *Node) learnBridgeRouteLocked(network *Network, mac MAC, bridge Address, now time.Time) {
	if mac.Uint64() == 0 || mac.IsMulticast() || !network.Config.isSpecialist(bridge, specialistTypeActiveBridge) {
		return
	}
	if _, exists := network.bridgeRoutes[mac]; !exists && len(network.bridgeRoutes) >= maxBridgeRoutes {
		for candidate := range network.bridgeRoutes {
			delete(network.bridgeRoutes, candidate)
			break
		}
	}
	network.bridgeRoutes[mac] = bridgeRoute{bridge: bridge, learned: now}
}

// ensureMulticastGroupLocked returns or creates the member table for group.
func (n *Node) ensureMulticastGroupLocked(network *Network, group MulticastGroup) map[Address]time.Time {
	if members := network.multicast[group]; members != nil {
		return members
	}
	if len(network.multicast) >= maxMulticastGroups {
		return nil
	}
	members := make(map[Address]time.Time)
	network.multicast[group] = members
	return members
}

// subscribedMulticastGroupsLocked snapshots explicitly subscribed groups.
func (n *Node) subscribedMulticastGroupsLocked(network *Network) []MulticastGroup {
	groups := make([]MulticastGroup, 0, len(network.Config.Assigned)+len(network.multicastSubscriptions)+1)
	seen := make(map[MulticastGroup]struct{}, cap(groups))
	appendGroup := func(group MulticastGroup) {
		if _, exists := seen[group]; exists {
			return
		}
		seen[group] = struct{}{}
		groups = append(groups, group)
	}
	if network.Config.Flags&NetworkConfigFlagEnableBroadcast != 0 {
		appendGroup(MulticastGroup{MAC: NewMAC(0xffffffffffff)})
	}
	for _, prefix := range network.Config.Assigned {
		address := prefix.Addr()
		if address.Is4() {
			raw := address.As4()
			appendGroup(MulticastGroup{MAC: NewMAC(0xffffffffffff), ADI: binary.BigEndian.Uint32(raw[:])})
		} else if address.Is6() {
			raw := address.As16()
			appendGroup(MulticastGroup{MAC: NewMAC(0x3333ff000000 | uint64(raw[13])<<16 | uint64(raw[14])<<8 | uint64(raw[15]))})
		}
	}
	for group := range network.multicastSubscriptions {
		appendGroup(group)
	}
	return groups
}

// subscribedToMulticastGroupLocked reports whether wanted matches a local
// subscription.
func (n *Node) subscribedToMulticastGroupLocked(network *Network, wanted MulticastGroup) bool {
	for _, group := range n.subscribedMulticastGroupsLocked(network) {
		if group == wanted {
			return true
		}
	}
	return false
}
