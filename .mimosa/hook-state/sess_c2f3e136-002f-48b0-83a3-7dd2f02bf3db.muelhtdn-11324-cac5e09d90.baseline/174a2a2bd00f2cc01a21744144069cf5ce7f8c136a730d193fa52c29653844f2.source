// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

package zerotier

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"net/netip"
	"reflect"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"
)

// configureAdHocNetworkLocked synthesizes the deterministic public ad-hoc
// configuration for networkID.
func (n *Node) configureAdHocNetworkLocked(networkID uint64, now time.Time) error {
	network := n.networks[networkID]
	if network == nil {
		return ErrNetworkNotFound
	}
	eventType := EventNetworkConfigReady
	if network.Status == NetworkStatusOK {
		eventType = EventNetworkConfigChanged
	}
	config := NetworkConfigData{
		Version: networkConfigVersion, NetworkID: networkID,
		Timestamp: uint64(now.UnixMilli()), Revision: 1, IssuedTo: n.identity.Address(),
		Flags: NetworkConfigFlagEnableIPv6NDPEmulation, CredentialTimeMaxDelta: uint64((2 * time.Hour) / time.Millisecond),
		Type: NetworkTypePublic, MTU: DefaultNetworkMTU,
	}
	switch {
	case networkID&0xffffff == 0:
		startPort := uint16(networkID >> 40)
		endPort := uint16(networkID >> 24)
		if endPort < startPort {
			return n.rejectAdHocNetworkLocked(network, now)
		}
		config.Name = fmt.Sprintf("adhoc-%04x-%04x", startPort, endPort)
		config.Assigned = []netip.Prefix{SixPlaneAddress(networkID, n.identity.Address())}
		config.Rules = []NetworkRule{
			{Type: ruleMatchEtherType | ruleFlagNOT, Value: []byte{byte(EtherTypeIPv6 >> 8), byte(EtherTypeIPv6 & 0xff)}},
			{Type: ruleActionDrop},
			{Type: ruleMatchIPProtocol, Value: []byte{58}},
			{Type: ruleActionAccept},
			{Type: ruleMatchIPProtocol, Value: []byte{17}},
			{Type: ruleMatchIPProtocol | ruleFlagOR, Value: []byte{6}},
			{Type: ruleMatchIPDestPort, Value: []byte{byte(startPort >> 8), byte(startPort), byte(endPort >> 8), byte(endPort)}},
			{Type: ruleActionAccept},
			{Type: ruleMatchCharacteristics | ruleFlagNOT, Value: uint64RuleValue(0x02)},
			{Type: ruleActionAccept},
			{Type: ruleMatchCharacteristics, Value: uint64RuleValue(0x02)},
			{Type: ruleMatchCharacteristics, Value: uint64RuleValue(0x10)},
			{Type: ruleActionAccept},
			{Type: ruleActionDrop},
		}
	case networkID&0xff == 0x01:
		hub, _ := adHocNetworkHub(networkID)
		address := n.identity.Address().Uint64()
		ipv4 := netip.AddrFrom4([4]byte{byte(networkID >> 48), byte(address >> 16), byte(address >> 8), byte(address)})
		config.Name = fmt.Sprintf("adhoc-%d.0.0.0", byte(networkID>>48))
		config.MulticastLimit = 1024
		config.Assigned = []netip.Prefix{SixPlaneAddress(networkID, n.identity.Address()), netip.PrefixFrom(ipv4, 8)}
		config.Rules = []NetworkRule{{Type: ruleActionAccept}}
		if !hub.IsZero() {
			config.Specialists = []uint64{hub.Uint64()}
			n.requestWhoisLocked(hub, now)
		}
	default:
		return n.rejectAdHocNetworkLocked(network, now)
	}
	network.Config = config
	n.invalidateNetworkCredentialsLocked(networkID)
	network.multicastAnnouncements = make(map[Address]time.Time)
	network.Authentication = NetworkAuthenticationInfo{}
	network.Status = NetworkStatusOK
	network.reportNextFailure = false
	network.LastConfigRequest = now
	network.LastConfigReceive = now
	network.configUpdateSerial++
	if callback := n.onNetworkConfig; callback != nil {
		callbackConfig := cloneNetworkConfig(config)
		n.callbacks = append(n.callbacks, func() { callback(callbackConfig) })
	}
	n.emitLocked(Event{Type: eventType, NetworkID: networkID})
	n.announceMulticastLocked(network, now)
	return nil
}

// adHocNetworkHub extracts the hub address encoded by a supported ad-hoc
// network ID.
func adHocNetworkHub(networkID uint64) (Address, bool) {
	if IsAdHocNetworkID(networkID) && networkID&0xff == 0x01 {
		hub := NewAddress(networkID >> 8)
		return hub, !hub.IsZero() && !hub.IsReserved()
	}
	return 0, false
}

// rejectAdHocNetworkLocked marks an unsupported ad-hoc ID as not found.
func (n *Node) rejectAdHocNetworkLocked(network *Network, now time.Time) error {
	network.LastConfigRequest = now
	n.setNetworkFailureLocked(network, NetworkStatusNotFound, NetworkAuthenticationInfo{}, EventNetworkNotFound)
	return nil
}

// uint64RuleValue encodes a uint64 network rule operand in network byte order.
func uint64RuleValue(value uint64) []byte {
	var data [8]byte
	binary.BigEndian.PutUint64(data[:], value)
	return data[:]
}

const (
	// networkConfigVersion is the dictionary format emitted in configuration
	// requests and locally generated configurations.
	networkConfigVersion = 7
	// maxNetworkConfigSize bounds chunk assembly memory; one MiB accommodates
	// the official rule and capability maxima within the uint32 wire length.
	maxNetworkConfigSize = 1 << 20
	// DefaultNetworkMTU is used when a configuration does not specify a valid
	// virtual network MTU.
	DefaultNetworkMTU = 2800
	// MinNetworkMTU is the smallest accepted virtual network MTU.
	MinNetworkMTU = 1280
	// MaxNetworkMTU is the largest accepted virtual network MTU.
	MaxNetworkMTU = 10000
	// maxNetworkSpecialists bounds specialist records accepted from a
	// controller configuration.
	maxNetworkSpecialists = 512
	// maxAssignedAddresses bounds managed addresses accepted from a controller.
	maxAssignedAddresses = 32
	// maxNetworkRoutes bounds managed routes accepted from a controller.
	maxNetworkRoutes = 128
	// maxNetworkNameLength bounds the decoded network name.
	maxNetworkNameLength = 127
	// maxAuthenticationURL bounds decoded external-authentication URLs.
	maxAuthenticationURL = 2047
	// maxSSONonceLength bounds a decoded legacy SSO nonce.
	maxSSONonceLength = 127
	// maxSSOStateLength bounds a decoded legacy SSO state value.
	maxSSOStateLength = 255
	// maxSSOClientIDLength bounds a decoded legacy SSO client identifier.
	maxSSOClientIDLength = 255
	// maxSSOProviderLength bounds a decoded legacy SSO provider name.
	maxSSOProviderLength = 63
	// maxLegacyTextLength bounds legacy comma-separated configuration fields.
	maxLegacyTextLength = 1023

	// NetworkConfigFlagEnableBroadcast permits Ethernet broadcast frames.
	NetworkConfigFlagEnableBroadcast = uint64(0x02)
	// NetworkConfigFlagEnableIPv6NDPEmulation permits deterministic ZeroTier
	// IPv6 addresses to use NDP emulation.
	NetworkConfigFlagEnableIPv6NDPEmulation = uint64(0x04)

	// specialistTypeActiveBridge identifies a member allowed to bridge frames.
	specialistTypeActiveBridge = uint64(0x0000020000000000)
	// specialistTypeMulticastReplicator identifies a member that replicates
	// multicast traffic.
	specialistTypeMulticastReplicator = uint64(0x0000080000000000)
	// specialistTypeNetworkRelay identifies a member that relays network frames.
	specialistTypeNetworkRelay = uint64(0x0000100000000000)
)

// NetworkType identifies a controller configuration's membership model.
type NetworkType uint8

const (
	// NetworkTypePrivate requires a valid certificate of membership.
	NetworkTypePrivate NetworkType = iota
	// NetworkTypePublic accepts members without a certificate of membership.
	NetworkTypePublic
)

// String returns the stable configuration name of t.
func (t NetworkType) String() string {
	switch t {
	case NetworkTypePrivate:
		return "private"
	case NetworkTypePublic:
		return "public"
	default:
		return fmt.Sprintf("network-type(%d)", uint8(t))
	}
}

// MarshalText returns the stable configuration name of t for text-based encoders.
func (t NetworkType) MarshalText() ([]byte, error) {
	return []byte(t.String()), nil
}

// UnmarshalText parses the stable configuration name of a network type.
func (t *NetworkType) UnmarshalText(text []byte) error {
	var value NetworkType
	switch string(text) {
	case "private":
		value = NetworkTypePrivate
	case "public":
		value = NetworkTypePublic
	default:
		return fmt.Errorf("invalid ZeroTier network type %q", text)
	}
	*t = value
	return nil
}

// NetworkRoute is one controller-managed route installed on a virtual link.
type NetworkRoute struct {
	Target netip.Prefix
	Via    netip.Addr
	Flags  uint16
	Metric uint16
}

// NetworkConfigData is the validated controller configuration for one network.
type NetworkConfigData struct {
	Version                uint64
	NetworkID              uint64
	Timestamp              uint64
	Revision               uint64
	IssuedTo               Address
	Flags                  uint64
	CredentialTimeMaxDelta uint64
	Type                   NetworkType
	Name                   string
	MTU                    uint32
	MulticastLimit         uint32
	Assigned               []netip.Prefix
	Routes                 []NetworkRoute
	DNSDomain              string
	DNSServers             []netip.AddrPort
	SSOEnabled             bool
	SSOVersion             uint64
	AuthenticationURL      string
	AuthenticationExpiry   uint64
	IssuerURL              string
	CentralAuthURL         string
	SSONonce               string
	SSOState               string
	SSOClientID            string
	SSOProvider            string
	RemoteTraceTarget      Address
	RemoteTraceLevel       uint64
	COM                    *CertificateOfMembership
	Ownership              []CertificateOfOwnership
	Tags                   []Tag
	Capabilities           []Capability
	Specialists            []uint64
	RulesRaw               []byte
	Rules                  []NetworkRule
	Raw                    []byte
}

// Equal reports whether both values produce the same effective network
// configuration. Dictionary ordering, unknown keys, and cached wire encodings
// do not affect the result, matching NetworkConfig::operator== in ZeroTier One.
func (c NetworkConfigData) Equal(other NetworkConfigData) bool {
	return reflect.DeepEqual(comparableNetworkConfig(c), comparableNetworkConfig(other))
}

// ManagedAddressesEqual reports whether both configurations contain the same
// assigned prefixes, independent of controller-provided ordering.
func (c NetworkConfigData) ManagedAddressesEqual(other NetworkConfigData) bool {
	if len(c.Assigned) != len(other.Assigned) {
		return false
	}
	matched := make([]bool, len(other.Assigned))
	for _, prefix := range c.Assigned {
		found := false
		for i, candidate := range other.Assigned {
			if !matched[i] && prefix == candidate {
				matched[i] = true
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	return true
}

// HasManagedIPv6 reports whether the configuration assigns at least one IPv6
// prefix to the local member.
func (c NetworkConfigData) HasManagedIPv6() bool {
	for _, prefix := range c.Assigned {
		if prefix.Addr().Is6() {
			return true
		}
	}
	return false
}

// comparableNetworkConfig removes representation-only differences before
// semantic configuration comparison.
func comparableNetworkConfig(config NetworkConfigData) NetworkConfigData {
	config = cloneNetworkConfig(config)
	config.Version = 0 // Parsing format is not retained by the official structure.
	config.Raw = nil
	config.RulesRaw = nil
	if len(config.Assigned) == 0 {
		config.Assigned = nil
	}
	if len(config.Routes) == 0 {
		config.Routes = nil
	}
	if len(config.DNSServers) == 0 {
		config.DNSServers = nil
	}
	if len(config.Ownership) == 0 {
		config.Ownership = nil
	}
	if len(config.Tags) == 0 {
		config.Tags = nil
	}
	if len(config.Capabilities) == 0 {
		config.Capabilities = nil
	}
	if len(config.Specialists) == 0 {
		config.Specialists = nil
	}
	if len(config.Rules) == 0 {
		config.Rules = nil
	}
	for i := range config.Rules {
		if len(config.Rules[i].Value) == 0 {
			config.Rules[i].Value = nil
		}
	}
	if config.COM != nil {
		certificate := *config.COM
		certificate.raw = nil
		if len(certificate.Qualifiers) == 0 {
			certificate.Qualifiers = nil
		}
		config.COM = &certificate
	}
	for i := range config.Ownership {
		config.Ownership[i].raw = nil
		if len(config.Ownership[i].Things) == 0 {
			config.Ownership[i].Things = nil
		}
	}
	for i := range config.Tags {
		config.Tags[i].raw = nil
	}
	for i := range config.Capabilities {
		config.Capabilities[i].raw = nil
		if len(config.Capabilities[i].Rules) == 0 {
			config.Capabilities[i].Rules = nil
		}
		for j := range config.Capabilities[i].Rules {
			if len(config.Capabilities[i].Rules[j].Value) == 0 {
				config.Capabilities[i].Rules[j].Value = nil
			}
		}
		if len(config.Capabilities[i].Custody) == 0 {
			config.Capabilities[i].Custody = nil
		}
	}
	return config
}

// configAssembly tracks chunks of one in-progress controller configuration.
type configAssembly struct {
	updateID  uint64
	data      []byte
	received  []bool
	count     int
	updatedAt time.Time
}

// buildNetworkConfigMetadata encodes this implementation's controller request
// capabilities.
func buildNetworkConfigMetadata() ([]byte, error) {
	entries := []struct {
		key   string
		value uint64
	}{
		{"v", networkConfigVersion},
		{"vend", 1},
		{"pv", ProtocolVersion},
		{"majv", nodeVersionMajor},
		{"minv", nodeVersionMinor},
		{"revv", nodeVersionRev},
		{"mr", 1024},
		{"mc", maxNetworkCapabilities},
		{"mcr", maxCapabilityRules},
		{"mt", maxNetworkTags},
		{"f", 0},
		{"revr", 1},
	}
	var data []byte
	var err error
	for _, entry := range entries {
		data, err = appendDictionaryUint(data, entry.key, entry.value)
		if err != nil {
			return nil, err
		}
	}
	return appendDictionaryEntry(data, "o", []byte(zeroTierTargetName(runtime.GOOS, runtime.GOARCH)))
}

// zeroTierTargetName maps a Go target to ZeroTier's controller platform name.
func zeroTierTargetName(goos, goarch string) string {
	platform := "unknown"
	switch goos {
	case "windows", "android", "linux", "aix":
		platform = goos
	case "solaris", "illumos":
		platform = "solaris"
	case "darwin":
		platform = "macos"
	case "ios":
		platform = "ios_iphone"
	case "freebsd", "netbsd", "openbsd", "dragonfly":
		platform = "bsd"
	}
	architecture := "unknown"
	switch goarch {
	case "amd64":
		architecture = "x86_64"
	case "386":
		architecture = "x86"
	case "arm", "arm64", "mips":
		architecture = goarch
	case "loong64":
		architecture = "loongarch"
	case "mips64", "mips64le", "mips64p32", "mips64p32le", "mipsle":
		architecture = "mips"
	case "riscv64":
		architecture = "riscv"
	case "ppc64", "ppc64le":
		architecture = "powerpc"
	case "s390x":
		architecture = "s390"
	}
	return platform + "/" + architecture
}

// sendNetworkConfigRequestPacketLocked sends one controller configuration
// request and records it as pending.
func (n *Node) sendNetworkConfigRequestPacketLocked(networkID uint64, now time.Time) error {
	controller := n.loadPeerCacheLocked(Controller(networkID), now)
	if controller == nil {
		return ErrUnknownPeer
	}
	metadata, err := buildNetworkConfigMetadata()
	if err != nil {
		return err
	}
	packet, err := NewPacket(controller.identity.Address(), n.identity.Address(), VerbNetworkConfigRequest)
	if err != nil {
		return err
	}
	_ = packet.AppendUint64(networkID)
	_ = packet.AppendUint16(uint16(len(metadata)))
	_ = packet.Append(metadata...)
	network := n.networks[networkID]
	if network != nil && network.Config.NetworkID == networkID {
		_ = packet.AppendUint64(network.Config.Revision)
		_ = packet.AppendUint64(network.Config.Timestamp)
	} else {
		_ = packet.Append(make([]byte, 16)...)
	}
	if err := packet.Compress(); err != nil {
		return err
	}
	if err := n.addPendingLocked(packet.PacketID(), pendingRequest{verb: VerbNetworkConfigRequest, peer: controller.identity.Address(), networkID: networkID, sentAt: now}); err != nil {
		return err
	}
	if err := n.sendPacketLocked(controller, packet, true); err != nil {
		n.deletePendingLocked(packet.PacketID())
		return err
	}
	n.traceNetworkConfigRequestLocked(networkID, controller.identity.Address())
	if network != nil {
		network.LastConfigRequest = now
	}
	return nil
}

// loadCachedNetworkConfigLocked applies a valid persisted configuration.
func (n *Node) loadCachedNetworkConfigLocked(network *Network) {
	data, err := n.store.Get(networkStateName(network.ID))
	if err != nil {
		return
	}
	config, err := ParseNetworkConfig(data)
	if err != nil || config.NetworkID != network.ID || config.IssuedTo != n.identity.Address() {
		return
	}
	if config.Type != NetworkTypePublic {
		if config.COM == nil || config.COM.NetworkID() != network.ID || config.COM.IssuedTo() != n.identity.Address() {
			return
		}
		network.members[n.identity.Address()] = *config.COM
	}
	for _, certificate := range config.Ownership {
		if certificate.NetworkID != network.ID || certificate.IssuedTo != n.identity.Address() || certificate.SignedBy != Controller(network.ID) {
			return
		}
	}
	for _, tag := range config.Tags {
		if tag.NetworkID != network.ID || tag.IssuedTo != n.identity.Address() || tag.SignedBy != Controller(network.ID) {
			return
		}
	}
	for _, capability := range config.Capabilities {
		if capability.NetworkID != network.ID || capability.IssuedTo() != n.identity.Address() || len(capability.Custody) == 0 || capability.Custody[0].From != Controller(network.ID) {
			return
		}
	}
	network.Config = config
	n.invalidateNetworkCredentialsLocked(network.ID)
	network.multicastAnnouncements = make(map[Address]time.Time)
	network.Authentication = authenticationFromConfig(config)
	network.Status = NetworkStatusOK
	network.reportNextFailure = false
	if callback := n.onNetworkConfig; callback != nil {
		config = cloneNetworkConfig(config)
		n.callbacks = append(n.callbacks, func() { callback(config) })
	}
	n.emitLocked(Event{Type: EventNetworkConfigReady, NetworkID: network.ID})
}

// handleNetworkConfigChunkLocked validates and stores one configuration chunk.
func (n *Node) handleNetworkConfigChunkLocked(packet *Packet, payloadOffset int, now time.Time) error {
	payload := packet.Payload()
	if payloadOffset < 0 || len(payload)-payloadOffset < 10 {
		return ErrInvalidPacket
	}
	start := payloadOffset
	networkID := binary.BigEndian.Uint64(payload[payloadOffset:])
	payloadOffset += 8
	chunkLength := int(binary.BigEndian.Uint16(payload[payloadOffset:]))
	payloadOffset += 2
	if chunkLength < 0 || len(payload)-payloadOffset < chunkLength {
		return ErrInvalidPacket
	}
	chunk := payload[payloadOffset : payloadOffset+chunkLength]
	payloadOffset += chunkLength
	network := n.networks[networkID]
	if network == nil {
		return nil
	}

	var updateID uint64
	var totalLength, chunkIndex int
	fastPropagate := false
	if payloadOffset == len(payload) {
		if packet.Source() != Controller(networkID) {
			return authenticatedContentError(ErrInvalidPacket)
		}
		updateID = packet.PacketID()
		totalLength = chunkLength
		chunkIndex = 0
	} else {
		if len(payload)-payloadOffset < 17+3+SignatureSize {
			return ErrInvalidPacket
		}
		fastPropagate = payload[payloadOffset]&0x01 != 0
		payloadOffset++ // flags
		updateID = binary.BigEndian.Uint64(payload[payloadOffset:])
		payloadOffset += 8
		totalLength = int(binary.BigEndian.Uint32(payload[payloadOffset:]))
		payloadOffset += 4
		chunkIndex = int(binary.BigEndian.Uint32(payload[payloadOffset:]))
		payloadOffset += 4
		if updateID == 0 || totalLength <= 0 || totalLength > maxNetworkConfigSize || chunkIndex < 0 || chunkIndex+chunkLength > totalLength {
			return authenticatedContentError(ErrInvalidPacket)
		}
		if payload[payloadOffset] != 1 || int(binary.BigEndian.Uint16(payload[payloadOffset+1:])) != SignatureSize || len(payload)-payloadOffset < 3+SignatureSize {
			return authenticatedContentError(ErrInvalidPacket)
		}
		signature := payload[payloadOffset+3 : payloadOffset+3+SignatureSize]
		controller := n.loadPeerCacheLocked(Controller(networkID), now)
		if controller == nil || !controller.identity.Verify(payload[start:payloadOffset], signature) {
			return authenticatedContentError(ErrInvalidPacket)
		}
	}
	if updateID == network.lastConfigUpdateID {
		return nil
	}

	assembly := network.assemblies[updateID]
	if assembly == nil || len(assembly.data) != totalLength {
		if assembly == nil && len(network.assemblies) >= 3 {
			var oldestID uint64
			var oldest time.Time
			for id, candidate := range network.assemblies {
				if oldest.IsZero() || candidate.updatedAt.Before(oldest) {
					oldestID, oldest = id, candidate.updatedAt
				}
			}
			delete(network.assemblies, oldestID)
		}
		assembly = &configAssembly{updateID: updateID, data: make([]byte, totalLength), received: make([]bool, totalLength)}
		network.assemblies[updateID] = assembly
	}
	assembly.updatedAt = now
	for i := 0; i < chunkLength; i++ {
		at := chunkIndex + i
		if assembly.received[at] && assembly.data[at] != chunk[i] {
			return authenticatedContentError(ErrInvalidPacket)
		}
	}
	copy(assembly.data[chunkIndex:], chunk)
	newBytes := false
	for i := chunkIndex; i < chunkIndex+chunkLength; i++ {
		if !assembly.received[i] {
			assembly.received[i] = true
			assembly.count++
			newBytes = true
		}
	}
	if fastPropagate && newBytes {
		n.propagateNetworkConfigChunkLocked(network, packet.Source(), payload[start:])
	}
	if assembly.count != len(assembly.data) {
		return nil
	}
	return authenticatedContentError(n.applyNetworkConfigAssemblyLocked(network, updateID, now))
}

// applyNetworkConfigAssemblyLocked parses and installs a complete assembly.
func (n *Node) applyNetworkConfigAssemblyLocked(network *Network, updateID uint64, now time.Time) error {
	assembly := network.assemblies[updateID]
	if assembly == nil || assembly.count != len(assembly.data) {
		return nil
	}
	networkID := network.ID
	config, err := ParseNetworkConfig(assembly.data)
	if err != nil {
		delete(network.assemblies, updateID)
		return err
	}
	reject := func(err error) error {
		delete(network.assemblies, updateID)
		return err
	}
	if config.NetworkID != networkID || config.IssuedTo != n.identity.Address() {
		return reject(ErrInvalidPacket)
	}
	if network.Status == NetworkStatusOK && network.Config.Equal(config) {
		delete(network.assemblies, updateID)
		network.lastConfigUpdateID = updateID
		network.LastConfigReceive = now
		n.clearPendingNetworkConfigRequestsLocked(networkID)
		return nil
	}
	eventType := EventNetworkConfigReady
	if network.Status == NetworkStatusOK {
		eventType = EventNetworkConfigChanged
	}
	controller := n.loadPeerCacheLocked(Controller(networkID), now)
	if config.Type != NetworkTypePublic {
		if controller == nil || config.COM == nil || config.COM.IssuedTo() != n.identity.Address() || config.COM.NetworkID() != networkID || !config.COM.Verify(controller.identity) {
			return reject(ErrInvalidPacket)
		}
	}
	for _, certificate := range config.Ownership {
		if controller == nil || certificate.NetworkID != networkID || certificate.IssuedTo != n.identity.Address() || !certificate.Verify(controller.identity) {
			return reject(ErrInvalidPacket)
		}
	}
	for _, tag := range config.Tags {
		if controller == nil || tag.NetworkID != networkID || tag.IssuedTo != n.identity.Address() || !tag.Verify(controller.identity) {
			return reject(ErrInvalidPacket)
		}
	}
	for _, capability := range config.Capabilities {
		if capability.NetworkID != networkID || capability.IssuedTo() != n.identity.Address() {
			return reject(ErrInvalidPacket)
		}
		missing, valid := capability.verify(func(address Address) (Identity, bool) {
			known := n.loadPeerCacheLocked(address, now)
			if known == nil {
				return Identity{}, false
			}
			return known.identity, true
		})
		if !valid {
			if !missing.IsZero() {
				n.requestWhoisLocked(missing, now)
				return ErrUnknownPeer
			}
			return reject(ErrInvalidPacket)
		}
	}
	network.Status = NetworkStatusOK
	network.reportNextFailure = false
	network.Config = config
	n.invalidateNetworkCredentialsLocked(networkID)
	network.multicastAnnouncements = make(map[Address]time.Time)
	network.Authentication = authenticationFromConfig(config)
	delete(network.assemblies, updateID)
	network.lastConfigUpdateID = updateID
	network.configUpdateSerial++
	network.LastConfigReceive = now
	_ = n.store.Put(networkStateName(networkID), config.Raw)
	n.clearPendingNetworkConfigRequestsLocked(networkID)
	if callback := n.onNetworkConfig; callback != nil {
		config = cloneNetworkConfig(config)
		n.callbacks = append(n.callbacks, func() { callback(config) })
	}
	n.emitLocked(Event{Type: eventType, NetworkID: networkID})
	n.announceMulticastLocked(network, now)
	return nil
}

// clearPendingNetworkConfigRequestsLocked removes requests satisfied for a
// network.
func (n *Node) clearPendingNetworkConfigRequestsLocked(networkID uint64) {
	for packetID, request := range n.pending {
		if request.verb == VerbNetworkConfigRequest && request.networkID == networkID {
			n.deletePendingLocked(packetID)
		}
	}
}

// invalidateNetworkCredentialsLocked removes cached peer credentials for a
// changed network.
func (n *Node) invalidateNetworkCredentialsLocked(networkID uint64) {
	for _, peer := range n.peers {
		delete(peer.credentialsSent, networkID)
	}
}

// retryCompletedConfigAssembliesLocked reapplies assemblies deferred for peer
// identity discovery.
func (n *Node) retryCompletedConfigAssembliesLocked(now time.Time) {
	for _, network := range n.networks {
		for updateID, assembly := range network.assemblies {
			if assembly.count == len(assembly.data) {
				_ = n.applyNetworkConfigAssemblyLocked(network, updateID, now)
			}
		}
	}
}

// propagateNetworkConfigChunkLocked forwards controller chunks to eligible
// network members.
func (n *Node) propagateNetworkConfigChunkLocked(network *Network, sentFrom Address, chunk []byte) {
	for address := range networkCredentialRecipients(network) {
		if address == sentFrom || address == Controller(network.ID) || address == n.identity.Address() {
			continue
		}
		peer := n.loadPeerCacheLocked(address, time.Now())
		if peer == nil {
			continue
		}
		packet, err := NewPacket(address, n.identity.Address(), VerbNetworkConfig)
		if err != nil {
			continue
		}
		if packet.Append(chunk...) != nil {
			continue
		}
		_ = n.sendPacketLocked(peer, packet, true)
	}
}

// ParseNetworkConfig decodes current or legacy controller dictionary data.
func ParseNetworkConfig(data []byte) (NetworkConfigData, error) {
	if len(data) == 0 || len(data) > maxNetworkConfigSize {
		return NetworkConfigData{}, ErrInvalidDictionary
	}
	dictionary, err := ParseDictionary(data)
	if err != nil {
		return NetworkConfigData{}, err
	}
	config := NetworkConfigData{
		Version:                dictionary.Uint("v", 0),
		NetworkID:              dictionary.Uint("nwid", 0),
		Timestamp:              dictionary.Uint("ts", 0),
		Revision:               dictionary.Uint("r", 0),
		IssuedTo:               NewAddress(dictionary.Uint("id", 0)),
		Flags:                  dictionary.Uint("f", 0),
		CredentialTimeMaxDelta: dictionary.Uint("ctmd", 0),
		Type:                   NetworkType(dictionary.Uint("t", 0)),
		Name:                   dictionaryString(dictionary, "n", maxNetworkNameLength),
		MTU:                    uint32(dictionary.Uint("mtu", DefaultNetworkMTU)),
		MulticastLimit:         uint32(dictionary.Uint("ml", 0)),
		SSOEnabled:             dictionary.Bool("ssoe", false),
		SSOVersion:             dictionary.Uint("ssov", 0),
		AuthenticationURL:      dictionaryString(dictionary, "aurl", maxAuthenticationURL),
		AuthenticationExpiry:   dictionary.Uint("aexpt", 0),
		IssuerURL:              dictionaryString(dictionary, "iurl", maxAuthenticationURL),
		CentralAuthURL:         dictionaryString(dictionary, "ssoce", maxAuthenticationURL),
		SSONonce:               dictionaryString(dictionary, "sson", maxSSONonceLength),
		SSOState:               dictionaryString(dictionary, "ssos", maxSSOStateLength),
		SSOClientID:            dictionaryString(dictionary, "ssocid", maxSSOClientIDLength),
		SSOProvider:            dictionaryString(dictionary, "ssop", maxSSOProviderLength),
		RemoteTraceTarget:      NewAddress(dictionary.Uint("tt", 0)),
		RemoteTraceLevel:       dictionary.Uint("tl", 0),
		RulesRaw:               append([]byte(nil), dictionary["R"]...),
		Raw:                    append([]byte(nil), data...),
	}
	if config.NetworkID == 0 || config.IssuedTo.IsZero() {
		return NetworkConfigData{}, ErrInvalidDictionary
	}
	if config.MTU < MinNetworkMTU {
		config.MTU = MinNetworkMTU
	} else if config.MTU > MaxNetworkMTU {
		config.MTU = MaxNetworkMTU
	}
	if config.Version < 6 {
		if err := parseLegacyNetworkConfig(dictionary, &config); err != nil {
			return NetworkConfigData{}, err
		}
		return config, nil
	}
	normalizeNetworkAuthentication(&config)
	if value := dictionary["I"]; len(value) > 0 {
		for pos := 0; pos < len(value) && len(config.Assigned) < maxAssignedAddresses; {
			address, consumed, err := parseInetAddress(value[pos:])
			if err != nil || !address.IsValid() {
				return NetworkConfigData{}, ErrInvalidDictionary
			}
			bits := int(address.Port())
			if bits > address.Addr().BitLen() {
				return NetworkConfigData{}, ErrInvalidDictionary
			}
			config.Assigned = append(config.Assigned, netip.PrefixFrom(address.Addr(), bits))
			pos += consumed
		}
	}
	if value := dictionary["RT"]; len(value) > 0 {
		for pos := 0; pos < len(value) && len(config.Routes) < maxNetworkRoutes; {
			target, consumed, err := parseInetAddress(value[pos:])
			if err != nil {
				return NetworkConfigData{}, ErrInvalidDictionary
			}
			pos += consumed
			via, consumed, err := parseInetAddress(value[pos:])
			if err != nil {
				return NetworkConfigData{}, ErrInvalidDictionary
			}
			pos += consumed
			if len(value)-pos < 4 {
				return NetworkConfigData{}, ErrInvalidDictionary
			}
			flags, metric := binary.BigEndian.Uint16(value[pos:]), binary.BigEndian.Uint16(value[pos+2:])
			pos += 4
			if !target.IsValid() {
				if !via.IsValid() {
					continue
				}
				if via.Addr().Is4() {
					target = netip.AddrPortFrom(netip.IPv4Unspecified(), 0)
				} else {
					target = netip.AddrPortFrom(netip.IPv6Unspecified(), 0)
				}
			}
			if int(target.Port()) > target.Addr().BitLen() {
				return NetworkConfigData{}, ErrInvalidDictionary
			}
			route := NetworkRoute{Target: netip.PrefixFrom(target.Addr(), int(target.Port())), Flags: flags, Metric: metric}
			if via.IsValid() {
				route.Via = via.Addr()
			}
			config.Routes = append(config.Routes, route)
		}
	}
	if value := dictionary["DNS"]; len(value) > 0 {
		if len(value) < 128 {
			return NetworkConfigData{}, ErrInvalidDictionary
		}
		config.DNSDomain = strings.TrimRight(string(value[:128]), "\x00")
		for pos, i := 128, 0; i < 4; i++ {
			server, consumed, err := parseInetAddress(value[pos:])
			if err != nil {
				return NetworkConfigData{}, ErrInvalidDictionary
			}
			if server.IsValid() {
				config.DNSServers = append(config.DNSServers, server)
			}
			pos += consumed
		}
	}
	if value := dictionary["C"]; len(value) > 0 {
		certificate, consumed, err := ParseCertificateOfMembership(value)
		if err != nil || consumed != len(value) {
			return NetworkConfigData{}, ErrInvalidDictionary
		}
		config.COM = &certificate
	}
	if value := dictionary["COO"]; len(value) > 0 {
		for pos := 0; pos < len(value); {
			certificate, consumed, err := ParseCertificateOfOwnership(value[pos:])
			if err != nil || consumed <= 0 {
				return NetworkConfigData{}, ErrInvalidDictionary
			}
			if len(config.Ownership) < maxOwnershipCerts {
				config.Ownership = append(config.Ownership, certificate)
			}
			pos += consumed
		}
	}
	if value := dictionary["TAG"]; len(value) > 0 {
		for pos := 0; pos < len(value) && len(config.Tags) < maxNetworkTags; {
			tag, consumed, err := ParseTag(value[pos:])
			if err != nil || consumed <= 0 {
				break
			}
			config.Tags = append(config.Tags, tag)
			pos += consumed
		}
		sort.Slice(config.Tags, func(i, j int) bool { return config.Tags[i].ID < config.Tags[j].ID })
	}
	if value := dictionary["CAP"]; len(value) > 0 {
		for pos := 0; pos < len(value) && len(config.Capabilities) < maxNetworkCapabilities; {
			capability, consumed, err := ParseCapability(value[pos:])
			if err != nil || consumed <= 0 {
				break
			}
			config.Capabilities = append(config.Capabilities, capability)
			pos += consumed
		}
		sort.Slice(config.Capabilities, func(i, j int) bool { return config.Capabilities[i].ID < config.Capabilities[j].ID })
	}
	if value := dictionary["S"]; len(value) > 0 {
		for pos := 0; pos+8 <= len(value) && len(config.Specialists) < maxNetworkSpecialists; pos += 8 {
			config.Specialists = append(config.Specialists, binary.BigEndian.Uint64(value[pos:]))
		}
	}
	if value := dictionary["R"]; len(value) > 0 {
		config.Rules, err = ParseNetworkRules(value)
		if err != nil {
			return NetworkConfigData{}, err
		}
	}
	return config, nil
}

// parseLegacyNetworkConfig translates legacy dictionary fields into the
// current configuration structure.
func parseLegacyNetworkConfig(dictionary Dictionary, config *NetworkConfigData) error {
	config.SSOEnabled = false
	config.SSOVersion = 0
	config.AuthenticationURL = ""
	config.AuthenticationExpiry = 0
	config.IssuerURL = ""
	config.CentralAuthURL = ""
	config.SSONonce = ""
	config.SSOState = ""
	config.SSOClientID = ""
	config.SSOProvider = ""
	config.Flags = NetworkConfigFlagEnableIPv6NDPEmulation
	if dictionary.Bool("eb", false) {
		config.Flags |= NetworkConfigFlagEnableBroadcast
	}
	config.Type = NetworkTypePrivate
	if !dictionary.Bool("p", true) {
		config.Type = NetworkTypePublic
	}
	for _, key := range []string{"v4s", "v6s"} {
		for _, value := range strings.Split(dictionaryString(dictionary, key, maxLegacyTextLength), ",") {
			value = strings.TrimSpace(value)
			if value == "" {
				continue
			}
			if len(config.Assigned) >= maxAssignedAddresses {
				break
			}
			prefix, err := netip.ParsePrefix(value)
			if err != nil || prefix.Addr().IsUnspecified() || prefix.Addr().IsMulticast() {
				return ErrInvalidDictionary
			}
			if prefix.Bits() > 0 && prefix.Bits() < prefix.Addr().BitLen() && prefix == prefix.Masked() {
				continue
			}
			config.Assigned = append(config.Assigned, prefix)
		}
	}
	if value := dictionaryString(dictionary, "com", maxLegacyTextLength); value != "" {
		certificate, err := parseCertificateOfMembershipString(value)
		if err != nil {
			return ErrInvalidDictionary
		}
		config.COM = &certificate
	}
	etherTypes := strings.TrimSpace(dictionaryString(dictionary, "et", maxLegacyTextLength))
	if etherTypes == "" {
		config.Rules = []NetworkRule{{Type: ruleActionAccept}}
	} else {
		for _, value := range strings.Split(etherTypes, ",") {
			parsed, err := strconv.ParseUint(strings.TrimSpace(value), 16, 16)
			if len(config.Rules)+2 > 1024 {
				break
			}
			if err != nil {
				return ErrInvalidDictionary
			}
			if parsed != 0 {
				match := []byte{byte(parsed >> 8), byte(parsed)}
				config.Rules = append(config.Rules, NetworkRule{Type: ruleMatchEtherType, Value: match})
			}
			config.Rules = append(config.Rules, NetworkRule{Type: ruleActionAccept})
		}
	}
	for _, value := range strings.Split(dictionaryString(dictionary, "ab", maxLegacyTextLength), ",") {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		parsed, err := strconv.ParseUint(value, 16, 64)
		if len(config.Specialists) >= maxNetworkSpecialists {
			break
		}
		if err != nil || NewAddress(parsed).IsReserved() {
			return ErrInvalidDictionary
		}
		config.Specialists = append(config.Specialists, specialistTypeActiveBridge|NewAddress(parsed).Uint64())
	}
	return nil
}

// dictionaryString returns a NUL-terminated dictionary value truncated to a
// protocol-specific byte limit.
func dictionaryString(dictionary Dictionary, key string, maximum int) string {
	value := dictionary[key]
	if nul := bytes.IndexByte(value, 0); nul >= 0 {
		value = value[:nul]
	}
	if len(value) > maximum {
		value = value[:maximum]
	}
	return string(value)
}

// normalizeNetworkAuthentication clears fields not valid for the advertised
// SSO version.
func normalizeNetworkAuthentication(config *NetworkConfigData) {
	if !config.SSOEnabled {
		config.AuthenticationURL = ""
		config.AuthenticationExpiry = 0
		config.IssuerURL = ""
		config.CentralAuthURL = ""
		config.SSONonce = ""
		config.SSOState = ""
		config.SSOClientID = ""
		config.SSOProvider = ""
		return
	}
	if config.SSOVersion == 0 {
		config.IssuerURL = ""
		config.CentralAuthURL = ""
		config.SSONonce = ""
		config.SSOState = ""
		config.SSOClientID = ""
		config.SSOProvider = ""
		return
	}
	if config.SSOVersion == 1 {
		if config.SSOProvider == "" {
			config.SSOProvider = "default"
		}
		return
	}
	config.AuthenticationURL = ""
	config.AuthenticationExpiry = 0
	config.IssuerURL = ""
	config.CentralAuthURL = ""
	config.SSONonce = ""
	config.SSOState = ""
	config.SSOClientID = ""
	config.SSOProvider = ""
}

// specialistAddresses returns members carrying any specialist bit in mask.
func (c NetworkConfigData) specialistAddresses(mask uint64) []Address {
	addresses := make([]Address, 0)
	for _, specialist := range c.Specialists {
		if specialist&mask != 0 {
			addresses = append(addresses, NewAddress(specialist))
		}
	}
	return addresses
}

// isSpecialist reports whether address carries a specialist bit in mask.
func (c NetworkConfigData) isSpecialist(address Address, mask uint64) bool {
	for _, specialist := range c.Specialists {
		if specialist&mask != 0 && NewAddress(specialist) == address {
			return true
		}
	}
	return false
}

// parseNetworkConfig retains the internal parser entry point used by node
// configuration processing.
func parseNetworkConfig(data []byte) (NetworkConfigData, error) {
	return ParseNetworkConfig(data)
}

// authenticationFromConfig extracts embedding-facing authentication details.
func authenticationFromConfig(config NetworkConfigData) NetworkAuthenticationInfo {
	return NetworkAuthenticationInfo{
		Version:           config.SSOVersion,
		AuthenticationURL: config.AuthenticationURL,
		IssuerURL:         config.IssuerURL,
		CentralAuthURL:    config.CentralAuthURL,
		Nonce:             config.SSONonce,
		State:             config.SSOState,
		ClientID:          config.SSOClientID,
		Provider:          config.SSOProvider,
	}
}

// cloneNetworkConfig returns a deep copy safe for callbacks and snapshots.
func cloneNetworkConfig(config NetworkConfigData) NetworkConfigData {
	cloned := config
	cloned.Assigned = append([]netip.Prefix(nil), config.Assigned...)
	cloned.Routes = append([]NetworkRoute(nil), config.Routes...)
	cloned.DNSServers = append([]netip.AddrPort(nil), config.DNSServers...)
	cloned.Specialists = append([]uint64(nil), config.Specialists...)
	cloned.RulesRaw = append([]byte(nil), config.RulesRaw...)
	cloned.Raw = append([]byte(nil), config.Raw...)
	cloned.Rules = cloneNetworkRules(config.Rules)
	cloned.Tags = append([]Tag(nil), config.Tags...)
	for i := range cloned.Tags {
		cloned.Tags[i].raw = append([]byte(nil), config.Tags[i].raw...)
	}
	cloned.Ownership = append([]CertificateOfOwnership(nil), config.Ownership...)
	for i := range cloned.Ownership {
		cloned.Ownership[i].Things = append([]OwnershipThing(nil), config.Ownership[i].Things...)
		cloned.Ownership[i].raw = append([]byte(nil), config.Ownership[i].raw...)
	}
	cloned.Capabilities = append([]Capability(nil), config.Capabilities...)
	for i := range cloned.Capabilities {
		cloned.Capabilities[i].Rules = cloneNetworkRules(config.Capabilities[i].Rules)
		cloned.Capabilities[i].Custody = append([]CapabilityCustody(nil), config.Capabilities[i].Custody...)
		cloned.Capabilities[i].raw = append([]byte(nil), config.Capabilities[i].raw...)
	}
	if config.COM != nil {
		certificate := *config.COM
		certificate.Qualifiers = append([]COMQualifier(nil), config.COM.Qualifiers...)
		certificate.raw = append([]byte(nil), config.COM.raw...)
		cloned.COM = &certificate
	}
	return cloned
}

// cloneNetworkRules returns a deep copy of rules and their operand bytes.
func cloneNetworkRules(rules []NetworkRule) []NetworkRule {
	cloned := make([]NetworkRule, len(rules))
	for i, rule := range rules {
		cloned[i] = NetworkRule{Type: rule.Type, Value: append([]byte(nil), rule.Value...)}
	}
	return cloned
}

// networkStateName returns the official persistent configuration object name.
func networkStateName(networkID uint64) string {
	return "networks.d/" + strings.ToLower(strconvHex16(networkID)) + ".conf"
}

// strconvHex16 formats value as sixteen lowercase hexadecimal digits.
func strconvHex16(value uint64) string {
	const digits = "0123456789abcdef"
	var result [16]byte
	for i := len(result) - 1; i >= 0; i-- {
		result[i] = digits[value&0xf]
		value >>= 4
	}
	return string(result[:])
}
