// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Package iplink adapts ZeroTier virtual Ethernet networks to layer-3 IP
// packet devices.
package iplink

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"net/netip"
	"sync"
	"time"

	zerotier "github.com/metacubex/zerotier-go"
)

const (
	// neighborRequestPeriod is the minimum interval between ARP or NDP
	// resolution requests and reachability probes.
	neighborRequestPeriod = time.Second
	// neighborCacheRefreshAfter marks a learned mapping stale. The next use
	// starts reachability detection without dropping that packet.
	neighborCacheRefreshAfter = 10 * time.Minute
	// neighborDelayProbeTime matches Linux's default delay before probing a
	// stale mapping that has been used.
	neighborDelayProbeTime = 5 * time.Second
	// neighborMaximumProbes matches Linux's default number of unicast probes
	// before a stale mapping becomes unreachable.
	neighborMaximumProbes = 3
	// pendingNeighborExpiration bounds packets waiting for address resolution.
	pendingNeighborExpiration = 10 * time.Second
	// maxNeighborCacheEntries bounds learned ARP and NDP mappings.
	maxNeighborCacheEntries = 4096
	// maxPendingDestinations bounds unresolved destinations with queued packets.
	maxPendingDestinations = 256
	// maxPendingPacketsPerDestination prevents one unresolved neighbor from
	// monopolizing the link's pending packet capacity.
	maxPendingPacketsPerDestination = 16 * 1024
	// maxPendingNeighborPackets bounds all packets awaiting address resolution.
	maxPendingNeighborPackets = 32 * 1024
	// maxPendingNeighborBytes bounds all packets waiting for address resolution.
	maxPendingNeighborBytes = 4 * 1024 * 1024
	// maxPendingNeighborBytesPerDestination preserves byte capacity for other
	// unresolved neighbors.
	maxPendingNeighborBytesPerDestination = maxPendingNeighborBytes / 4
	// maxMulticastGroups bounds IP multicast subscriptions tracked by the link.
	maxMulticastGroups = 4096
	// maxReportedMulticastSources bounds source details retained only to decide
	// whether a group-level ZeroTier subscription remains necessary. Overflow
	// switches to conservative incomplete tracking instead of losing traffic.
	maxReportedMulticastSources = 4096
	// membershipDefaultRobustness and the interval defaults are shared by
	// legacy queries and by current queries whose QRV or QQIC is zero.
	membershipDefaultRobustness    = 2
	membershipDefaultQueryInterval = 125 * time.Second
	membershipDefaultResponseTime  = 10 * time.Second
	// ipv4MembershipInvalidFragmentBits rejects the reserved flag, MF, and
	// fragment offset while permitting the independent DF flag.
	ipv4MembershipInvalidFragmentBits = 0xbfff
)

var (
	// ErrFrameSenderRequired reports construction without a ZeroTier frame path.
	ErrFrameSenderRequired = errors.New("ZeroTier IP link frame sender is required")
	// ErrNotConfigured reports packet I/O before applying network configuration.
	ErrNotConfigured = errors.New("ZeroTier IP link is not configured")
)

// FrameSender is implemented by a ZeroTier node. Its methods are invoked
// synchronously within a Link packet or configuration transaction and must
// not call back into the same Link. A zerotier.Node satisfies this contract.
type FrameSender interface {
	Address() zerotier.Address
	SendFrame(networkID uint64, destination zerotier.MAC, etherType uint16, payload []byte) error
}

// multicastSubscriber is optionally implemented by FrameSender so the link
// can translate IP membership reports into ZeroTier multicast LIKE state.
type multicastSubscriber interface {
	SubscribeMulticast(networkID uint64, group zerotier.MulticastGroup) error
	UnsubscribeMulticast(networkID uint64, group zerotier.MulticastGroup) error
}

// neighborState tracks the usable states of a learned mapping. A reachable
// entry whose deadline has passed is implicitly stale until its next use.
type neighborState uint8

const (
	// neighborReachable uses deadline as the end of the reachable period.
	neighborReachable neighborState = iota
	// neighborDelay keeps using the mapping until delayed probing begins.
	neighborDelay
	// neighborProbe keeps using the mapping during bounded unicast probes.
	neighborProbe
)

// neighborEntry is a learned IP-to-MAC mapping with compact Linux-style
// reachability state. deadline identifies either reachability expiration or
// the next DELAY/PROBE transition according to state.
type neighborEntry struct {
	mac      zerotier.MAC
	deadline time.Time
	state    neighborState
	probes   uint8
}

// pendingNeighbor queues packets while ARP or NDP resolution is outstanding.
type pendingNeighbor struct {
	packets     [][]byte
	bytes       int
	createdAt   time.Time
	requestedAt time.Time
	etherType   uint16
	source      netip.Addr
}

// reportedMulticastFilter tracks the minimum IGMPv3/MLDv2 interface state
// needed to translate source-list changes into ZeroTier's group-only L2
// subscriptions. EXCLUDE mode is always active and therefore stores no list.
type reportedMulticastFilter struct {
	exclude       bool
	incomplete    bool
	lastReport    time.Time
	queryDeadline time.Time
	sources       map[netip.Addr]struct{}
}

// reportedMembershipRecord is one fully validated IGMPv3 or MLDv2 group
// record waiting to be applied in the report's original order.
type reportedMembershipRecord struct {
	group      netip.Addr
	recordType byte
	sources    []netip.Addr
}

// active reports whether the L3 filter still requires its group-only
// ZeroTier subscription. An incomplete current-state INCLUDE snapshot stays
// active because a later report packet may contain more of its source list.
func (f *reportedMulticastFilter) active() bool {
	return f != nil && (f.exclude || f.incomplete || len(f.sources) != 0)
}

// addSources retains an exact set while it remains cheap enough to maintain.
// Once the bound is exceeded, incomplete keeps the group subscription active
// even if later BLOCK records remove every source that was retained.
func (f *reportedMulticastFilter) addSources(sources []netip.Addr) {
	if f.sources == nil {
		capacity := len(sources)
		if capacity > maxReportedMulticastSources {
			capacity = maxReportedMulticastSources
		}
		f.sources = make(map[netip.Addr]struct{}, capacity)
	}
	for _, source := range sources {
		if _, exists := f.sources[source]; exists {
			continue
		}
		if len(f.sources) >= maxReportedMulticastSources {
			f.incomplete = true
			return
		}
		f.sources[source] = struct{}{}
	}
}

// Link converts between IP packets and ZeroTier virtual Ethernet frames.
type Link struct {
	networkID uint64
	sender    FrameSender
	now       func() time.Time

	// Configuration operations may acquire configMu and then mu. Code holding
	// mu must never acquire configMu.
	configMu       sync.RWMutex
	configured     bool
	flags          uint64
	mtu            uint32
	multicastLimit uint32
	assigned       []netip.Prefix
	routes         []zerotier.NetworkRoute

	mu                     sync.RWMutex
	neighborCache          map[netip.Addr]neighborEntry
	neighborPending        map[netip.Addr]pendingNeighbor
	pendingNeighborPackets int
	pendingNeighborBytes   int
	reportedMemberships    map[netip.Addr]*reportedMulticastFilter
	automaticSubscriptions map[netip.Addr]zerotier.MulticastGroup
	activeMulticast        map[zerotier.MulticastGroup]struct{}
	multicastDirty         bool
}

// New creates an unconfigured L3 link for networkID over sender.
func New(networkID uint64, sender FrameSender) (*Link, error) {
	if networkID == 0 {
		return nil, errors.New("invalid ZeroTier network ID")
	}
	if sender == nil {
		return nil, ErrFrameSenderRequired
	}
	return &Link{
		networkID:              networkID,
		sender:                 sender,
		now:                    time.Now,
		neighborCache:          make(map[netip.Addr]neighborEntry),
		neighborPending:        make(map[netip.Addr]pendingNeighbor),
		reportedMemberships:    make(map[netip.Addr]*reportedMulticastFilter),
		automaticSubscriptions: make(map[netip.Addr]zerotier.MulticastGroup),
		activeMulticast:        make(map[zerotier.MulticastGroup]struct{}),
	}, nil
}

// ApplyNetworkConfig updates managed addresses, routes, and link policy.
// Pending neighbor resolution state is discarded when addresses, routes, or
// the MTU changes. Dynamic multicast state is discarded when addresses or the
// MTU changes because those changes delimit the lifetime of the attached L3
// interface; the replacement stack must report its own memberships.
func (l *Link) ApplyNetworkConfig(config zerotier.NetworkConfigData) error {
	if config.NetworkID != l.networkID {
		return fmt.Errorf("ZeroTier network configuration is for %016x, want %016x", config.NetworkID, l.networkID)
	}
	if len(config.Assigned) == 0 {
		return errors.New("ZeroTier controller assigned no managed addresses")
	}
	assigned, err := normalizeAssignedAddresses(config.Assigned)
	if err != nil {
		return err
	}
	routes := normalizeRoutes(config.Routes, assigned)
	mtu := config.MTU
	if mtu == 0 {
		mtu = zerotier.DefaultNetworkMTU
	} else if mtu < zerotier.MinNetworkMTU {
		mtu = zerotier.MinNetworkMTU
	} else if mtu > zerotier.MaxNetworkMTU {
		mtu = zerotier.MaxNetworkMTU
	}
	automatic := automaticMulticastSubscriptions(assigned)

	l.configMu.Lock()
	l.mu.Lock()
	interfaceChanged := l.configured && (!prefixesEqual(l.assigned, assigned) || l.mtu != mtu)
	previousAutomatic := l.automaticSubscriptions
	previousReported := l.reportedMemberships
	l.automaticSubscriptions = automatic
	if interfaceChanged {
		l.reportedMemberships = make(map[netip.Addr]*reportedMulticastFilter)
	}
	if err := l.refreshMulticastGroupsLocked(); err != nil {
		l.automaticSubscriptions = previousAutomatic
		l.reportedMemberships = previousReported
		err = errors.Join(err, l.syncMulticastGroupsLocked())
		l.mu.Unlock()
		l.configMu.Unlock()
		return err
	}
	if !prefixesEqual(l.assigned, assigned) || !routesEqual(l.routes, routes) || l.mtu != mtu {
		l.neighborCache = make(map[netip.Addr]neighborEntry)
		l.neighborPending = make(map[netip.Addr]pendingNeighbor)
		l.pendingNeighborPackets = 0
		l.pendingNeighborBytes = 0
	}
	l.flags = config.Flags
	l.mtu = mtu
	l.multicastLimit = config.MulticastLimit
	l.assigned = assigned
	l.routes = routes
	l.configured = true
	l.mu.Unlock()
	l.configMu.Unlock()
	return nil
}

// ValidateDestination reports whether an address can be represented on this
// ZeroTier IP link.
func (l *Link) ValidateDestination(destination netip.Addr) error {
	l.configMu.RLock()
	defer l.configMu.RUnlock()
	_, err := l.sourceForLocked(destination)
	return err
}

// SourceFor returns the managed source address selected for destination. It
// uses the same route and address-family rules as WritePacket.
func (l *Link) SourceFor(destination netip.Addr) (netip.Addr, error) {
	l.configMu.RLock()
	defer l.configMu.RUnlock()
	return l.sourceForLocked(destination)
}

// sourceForLocked selects a managed source address for destination.
func (l *Link) sourceForLocked(destination netip.Addr) (netip.Addr, error) {
	if !l.configured {
		return netip.Addr{}, ErrNotConfigured
	}
	destination = destination.Unmap()
	if !destination.IsValid() {
		return netip.Addr{}, errors.New("invalid ZeroTier destination address")
	}
	nextHop := destination
	if destination.IsMulticast() {
		if destination.Is6() && !validIPv6MulticastGroup(destination) {
			return netip.Addr{}, errors.New("invalid IPv6 multicast destination")
		}
		if destination.Is6() && destination.As16()[1]&0x0f == 1 {
			return netip.Addr{}, errors.New("IPv6 interface-local multicast cannot leave the host")
		}
		if l.multicastLimit == 0 {
			return netip.Addr{}, errors.New("ZeroTier network has multicast disabled")
		}
	} else if l.isIPv4BroadcastLocked(destination) {
		if l.flags&zerotier.NetworkConfigFlagEnableBroadcast == 0 {
			return netip.Addr{}, errors.New("ZeroTier network has broadcast disabled")
		}
		if l.multicastLimit == 0 {
			return netip.Addr{}, errors.New("ZeroTier network has multicast disabled")
		}
	} else {
		var ok bool
		nextHop, ok = l.routeForLocked(destination)
		if !ok {
			return netip.Addr{}, fmt.Errorf("destination %s is outside ZeroTier managed routes", destination)
		}
	}
	if nextHop.Is4() {
		if source, ok := l.localIPv4ForLocked(netip.Addr{}, nextHop); ok {
			return source, nil
		}
		return netip.Addr{}, errors.New("ZeroTier network has no managed IPv4 address")
	}
	if nextHop.Is6() {
		if source, ok := l.localIPv6ForLocked(netip.Addr{}, nextHop); ok {
			return source, nil
		}
		return netip.Addr{}, errors.New("ZeroTier network has no managed IPv6 address")
	}
	return netip.Addr{}, errors.New("invalid ZeroTier destination address")
}

// WritePacket sends a layer-3 packet over the ZeroTier virtual network.
func (l *Link) WritePacket(packet []byte) error {
	l.configMu.RLock()
	defer l.configMu.RUnlock()
	if !l.configured {
		return ErrNotConfigured
	}
	version, err := validateIPPacket(packet, l.mtu)
	if err != nil {
		return err
	}
	switch version {
	case 4:
		source := netip.AddrFrom4([4]byte{packet[12], packet[13], packet[14], packet[15]})
		destination := netip.AddrFrom4([4]byte{packet[16], packet[17], packet[18], packet[19]})
		if mac, multicast := ipv4MulticastMAC(destination); multicast {
			// Membership is local interface state and must survive a
			// temporary controller policy that prevents this report from
			// reaching the wire. The Node retains the subscription so it is
			// already available when multicast is enabled again.
			l.handleIPv4Membership(packet)
			if _, err = l.sourceForLocked(destination); err != nil {
				return err
			}
			return l.sender.SendFrame(l.networkID, mac, zerotier.EtherTypeIPv4, packet)
		}
		if l.isIPv4BroadcastLocked(destination) {
			if _, err = l.sourceForLocked(destination); err != nil {
				return err
			}
			return l.sender.SendFrame(l.networkID, zerotier.NewMAC(0xffffffffffff), zerotier.EtherTypeIPv4, packet)
		}
		nextHop, ok := l.routeForLocked(destination)
		if !ok {
			return fmt.Errorf("destination %s is outside ZeroTier managed routes", destination)
		}
		return l.sendIPv4Packet(source, nextHop, packet)
	case 6:
		if len(packet) < 40 {
			return errors.New("short IPv6 packet")
		}
		var raw [16]byte
		copy(raw[:], packet[24:40])
		destination := netip.AddrFrom16(raw)
		var sourceRaw [16]byte
		copy(sourceRaw[:], packet[8:24])
		source := netip.AddrFrom16(sourceRaw)
		if destination.IsMulticast() {
			l.handleIPv6Membership(packet)
			if _, err = l.sourceForLocked(destination); err != nil {
				return err
			}
			return l.sender.SendFrame(l.networkID, ipv6MulticastMAC(destination), zerotier.EtherTypeIPv6, packet)
		}
		nextHop, ok := l.routeForLocked(destination)
		if !ok {
			return fmt.Errorf("destination %s is outside ZeroTier managed routes", destination)
		}
		mac, ok := l.managedIPv6MACLocked(nextHop)
		if ok {
			return l.sender.SendFrame(l.networkID, mac, zerotier.EtherTypeIPv6, packet)
		}
		return l.sendIPv6Packet(source, nextHop, packet)
	default:
		return errors.New("unsupported IP version")
	}
}

// HandleFrame processes a received Ethernet frame. It returns an IP packet
// when the frame should be delivered to the layer-3 device.
func (l *Link) HandleFrame(frame zerotier.Frame) ([]byte, error) {
	if frame.NetworkID != l.networkID {
		return nil, nil
	}
	l.configMu.RLock()
	defer l.configMu.RUnlock()
	switch frame.EtherType {
	case zerotier.EtherTypeARP:
		return nil, l.handleARP(frame)
	case zerotier.EtherTypeIPv6:
		if l.inspectInboundIPv6Membership(frame.Payload) {
			return nil, nil
		}
		handled, err := l.handleNDP(frame)
		if handled || err != nil {
			return nil, err
		}
		return frame.Payload, nil
	case zerotier.EtherTypeIPv4:
		if l.inspectInboundIPv4Membership(frame.Payload) {
			return nil, nil
		}
		return frame.Payload, nil
	default:
		return nil, nil
	}
}

// sendIPv4Packet resolves nextHop and emits packet as an IPv4 Ethernet frame.
func (l *Link) sendIPv4Packet(source, nextHop netip.Addr, packet []byte) error {
	now := l.now()
	l.mu.Lock()
	l.cleanNeighborsLocked(now)
	if mac, ok, probe := l.neighborForSendLocked(nextHop, now); ok {
		l.mu.Unlock()
		err := l.sender.SendFrame(l.networkID, mac, zerotier.EtherTypeIPv4, packet)
		if probe {
			// Probe failure does not change the result of a packet already sent
			// through the stale mapping. The bounded state machine still advances.
			_ = l.sendNeighborProbe(source, nextHop, mac)
		}
		return err
	}
	request, err := l.enqueuePendingNeighborLocked(source, nextHop, zerotier.EtherTypeIPv4, packet, now)
	l.mu.Unlock()
	if err != nil {
		return err
	}
	if request {
		return l.sendNeighborProbe(source, nextHop, 0)
	}
	return nil
}

// sendARPRequest sends an address-resolution request for target. A zero
// destination broadcasts initial resolution; a learned MAC receives a
// unicast reachability probe.
func (l *Link) sendARPRequest(source, target netip.Addr, destination zerotier.MAC) error {
	if !target.Is4() {
		return errors.New("ZeroTier IPv4 route has a non-IPv4 next hop")
	}
	local, ok := l.localIPv4ForLocked(source, target)
	if !ok {
		return errors.New("ZeroTier network has no managed IPv4 address")
	}
	localMAC := zerotier.MACForAddress(l.sender.Address(), l.networkID)
	payload := make([]byte, 28)
	binary.BigEndian.PutUint16(payload[0:2], 1)
	binary.BigEndian.PutUint16(payload[2:4], zerotier.EtherTypeIPv4)
	payload[4], payload[5] = 6, 4
	binary.BigEndian.PutUint16(payload[6:8], 1)
	mac := localMAC.Bytes()
	copy(payload[8:14], mac[:])
	localRaw := local.As4()
	copy(payload[14:18], localRaw[:])
	targetRaw := target.As4()
	copy(payload[24:28], targetRaw[:])
	if destination.Uint64() == 0 {
		destination = zerotier.NewMAC(0xffffffffffff)
	}
	return l.sender.SendFrame(l.networkID, destination, zerotier.EtherTypeARP, payload)
}

// handleARP validates ARP, learns its sender, and answers local requests.
func (l *Link) handleARP(frame zerotier.Frame) error {
	payload := frame.Payload
	if len(payload) < 28 || binary.BigEndian.Uint16(payload[0:2]) != 1 || binary.BigEndian.Uint16(payload[2:4]) != zerotier.EtherTypeIPv4 || payload[4] != 6 || payload[5] != 4 {
		return nil
	}
	operation := binary.BigEndian.Uint16(payload[6:8])
	if operation != 1 && operation != 2 {
		return nil
	}
	senderMAC, err := zerotier.MACFromBytes(payload[8:14])
	if err != nil || senderMAC != frame.Source {
		return nil
	}
	senderIP := netip.AddrFrom4([4]byte{payload[14], payload[15], payload[16], payload[17]})
	targetIP := netip.AddrFrom4([4]byte{payload[24], payload[25], payload[26], payload[27]})
	err = l.learnNeighbor(senderIP, senderMAC, true)
	if operation != 1 {
		return err
	}
	localIP, ok := l.localIPv4ForLocked(targetIP, senderIP)
	if !ok || targetIP != localIP {
		return err
	}
	localMAC := zerotier.MACForAddress(l.sender.Address(), l.networkID)
	reply := make([]byte, 28)
	copy(reply, payload[:8])
	binary.BigEndian.PutUint16(reply[6:8], 2)
	localMACBytes := localMAC.Bytes()
	copy(reply[8:14], localMACBytes[:])
	localRaw := localIP.As4()
	copy(reply[14:18], localRaw[:])
	senderMACBytes := senderMAC.Bytes()
	copy(reply[18:24], senderMACBytes[:])
	senderRaw := senderIP.As4()
	copy(reply[24:28], senderRaw[:])
	return errors.Join(err, l.sender.SendFrame(l.networkID, senderMAC, zerotier.EtherTypeARP, reply))
}

// learnNeighbor records an IP-to-MAC mapping and flushes queued packets.
func (l *Link) learnNeighbor(address netip.Addr, mac zerotier.MAC, override bool) error {
	if !address.IsValid() || address.IsUnspecified() || address.IsMulticast() || mac.Uint64() == 0 || mac.IsMulticast() {
		return nil
	}
	now := l.now()
	l.mu.Lock()
	l.cleanNeighborsLocked(now)
	if entry, exists := l.neighborCache[address]; exists && entry.mac != mac && !override {
		l.mu.Unlock()
		return nil
	}
	if _, exists := l.neighborCache[address]; !exists && len(l.neighborCache) >= maxNeighborCacheEntries {
		l.evictOldestNeighborLocked()
	}
	l.neighborCache[address] = neighborEntry{mac: mac, deadline: now.Add(neighborCacheRefreshAfter)}
	pending := l.removePendingNeighborLocked(address)
	l.mu.Unlock()
	var result error
	for _, packet := range pending.packets {
		result = errors.Join(result, l.sender.SendFrame(l.networkID, mac, pending.etherType, packet))
	}
	return result
}

// localIPv4ForLocked selects a managed IPv4 source compatible with target.
func (l *Link) localIPv4ForLocked(source, target netip.Addr) (netip.Addr, bool) {
	if source.Is4() {
		for _, prefix := range l.assigned {
			if prefix.Addr().Is4() && prefix.Addr() == source {
				return source, true
			}
		}
	}
	var fallback netip.Addr
	for _, prefix := range l.assigned {
		if prefix.Addr().Is4() {
			if !fallback.IsValid() {
				fallback = prefix.Addr()
			}
			if target.Is4() && prefix.Contains(target) {
				return prefix.Addr(), true
			}
		}
	}
	return fallback, fallback.IsValid()
}

// localIPv6ForLocked selects a managed IPv6 source compatible with target.
func (l *Link) localIPv6ForLocked(source, target netip.Addr) (netip.Addr, bool) {
	if source.Is6() && !source.IsUnspecified() {
		for _, prefix := range l.assigned {
			if prefix.Addr().Is6() && prefix.Addr() == source {
				return source, true
			}
		}
	}
	var fallback netip.Addr
	for _, prefix := range l.assigned {
		if prefix.Addr().Is6() {
			if !fallback.IsValid() {
				fallback = prefix.Addr()
			}
			if target.Is6() && prefix.Contains(target) {
				return prefix.Addr(), true
			}
		}
	}
	return fallback, fallback.IsValid()
}

// sendIPv6Packet resolves nextHop and emits packet as an IPv6 Ethernet frame.
func (l *Link) sendIPv6Packet(source, nextHop netip.Addr, packet []byte) error {
	now := l.now()
	l.mu.Lock()
	l.cleanNeighborsLocked(now)
	if mac, ok, probe := l.neighborForSendLocked(nextHop, now); ok {
		l.mu.Unlock()
		err := l.sender.SendFrame(l.networkID, mac, zerotier.EtherTypeIPv6, packet)
		if probe {
			_ = l.sendNeighborProbe(source, nextHop, mac)
		}
		return err
	}
	request, err := l.enqueuePendingNeighborLocked(source, nextHop, zerotier.EtherTypeIPv6, packet, now)
	l.mu.Unlock()
	if err != nil {
		return err
	}
	if !request {
		return nil
	}
	return l.sendNeighborProbe(source, nextHop, 0)
}

// enqueuePendingNeighborLocked retains one packet while nextHop is unresolved
// and reports whether the caller should send a new resolution request.
func (l *Link) enqueuePendingNeighborLocked(source, nextHop netip.Addr, etherType uint16, packet []byte, now time.Time) (bool, error) {
	pending := l.neighborPending[nextHop]
	if len(pending.packets) == 0 && len(l.neighborPending) >= maxPendingDestinations {
		return false, errors.New("too many unresolved ZeroTier neighbor destinations")
	}
	if len(pending.packets) >= maxPendingPacketsPerDestination || len(packet) > maxPendingNeighborBytesPerDestination-pending.bytes {
		return false, errors.New("ZeroTier unresolved neighbor destination queue is full")
	}
	if l.pendingNeighborPackets >= maxPendingNeighborPackets || len(packet) > maxPendingNeighborBytes-l.pendingNeighborBytes {
		return false, errors.New("ZeroTier unresolved neighbor queue is full")
	}
	if len(pending.packets) == 0 {
		pending.createdAt = now
		pending.etherType = etherType
		pending.source = source
	}
	pending.packets = append(pending.packets, append([]byte(nil), packet...))
	pending.bytes += len(packet)
	l.pendingNeighborPackets++
	l.pendingNeighborBytes += len(packet)
	request := pending.requestedAt.IsZero() || now.Sub(pending.requestedAt) >= neighborRequestPeriod
	if request {
		pending.requestedAt = now
	}
	l.neighborPending[nextHop] = pending
	return request, nil
}

// removePendingNeighborLocked removes one destination and returns its queued
// packets while keeping the global packet and byte accounting exact.
func (l *Link) removePendingNeighborLocked(address netip.Addr) pendingNeighbor {
	pending := l.neighborPending[address]
	delete(l.neighborPending, address)
	l.pendingNeighborPackets -= len(pending.packets)
	l.pendingNeighborBytes -= pending.bytes
	return pending
}

// neighborForSendLocked returns a usable mapping and advances its Linux-style
// DELAY/PROBE lifecycle. A false usable result after probing means the mapping
// failed and the caller must begin ordinary neighbor resolution.
func (l *Link) neighborForSendLocked(address netip.Addr, now time.Time) (zerotier.MAC, bool, bool) {
	entry, ok := l.neighborCache[address]
	if !ok {
		return 0, false, false
	}
	if entry.state == neighborReachable {
		if now.Before(entry.deadline) {
			return entry.mac, true, false
		}
		// Linux permits the packet that uses a stale entry, then waits before
		// probing so upper-layer reachability confirmation has time to arrive.
		entry.state = neighborDelay
		entry.deadline = now.Add(neighborDelayProbeTime)
		l.neighborCache[address] = entry
		return entry.mac, true, false
	}
	if now.Before(entry.deadline) {
		return entry.mac, true, false
	}
	if entry.state == neighborProbe && entry.probes >= neighborMaximumProbes {
		delete(l.neighborCache, address)
		return 0, false, false
	}
	entry.state = neighborProbe
	entry.probes++
	entry.deadline = now.Add(neighborRequestPeriod)
	l.neighborCache[address] = entry
	return entry.mac, true, true
}

// sendNeighborProbe emits initial multicast resolution when destination is
// zero or a Linux-style unicast reachability probe to a learned MAC.
func (l *Link) sendNeighborProbe(source, target netip.Addr, destination zerotier.MAC) error {
	if target.Is4() {
		return l.sendARPRequest(source, target, destination)
	}
	if !target.Is6() {
		return errors.New("ZeroTier route has an invalid neighbor address")
	}
	local, ok := l.localIPv6ForLocked(source, target)
	if !ok {
		return errors.New("ZeroTier network has no managed IPv6 address")
	}
	return l.sendNeighborSolicitation(local, target, destination)
}

// sendNeighborSolicitation sends multicast resolution or a unicast NDP probe.
func (l *Link) sendNeighborSolicitation(source, target netip.Addr, destinationMAC zerotier.MAC) error {
	destination := target
	if destinationMAC.Uint64() == 0 {
		destination = solicitedNodeMulticast(target)
		destinationMAC = ipv6MulticastMAC(destination)
	}
	localMAC := zerotier.MACForAddress(l.sender.Address(), l.networkID)
	icmp := make([]byte, 32)
	icmp[0] = 135
	copy(icmp[8:24], target.AsSlice())
	icmp[24], icmp[25] = 1, 1
	macBytes := localMAC.Bytes()
	copy(icmp[26:32], macBytes[:])
	packet := makeIPv6ICMPPacket(source, destination, icmp)
	return l.sender.SendFrame(l.networkID, destinationMAC, zerotier.EtherTypeIPv6, packet)
}

// handleNDP validates neighbor discovery, learns senders, and answers local
// solicitations.
func (l *Link) handleNDP(frame zerotier.Frame) (bool, error) {
	packet := frame.Payload
	if len(packet) < 40 || packet[0]>>4 != 6 {
		return false, nil
	}
	icmp, protocol, fragmented, ok := ipv6Payload(packet)
	if !ok || protocol != 58 || len(icmp) == 0 {
		return false, nil
	}
	if icmp[0] != 135 && icmp[0] != 136 {
		return false, nil
	}
	if fragmented {
		return true, nil
	}
	if packet[7] != 255 || len(icmp) < 8 {
		return true, nil
	}
	var sourceRaw, destinationRaw [16]byte
	copy(sourceRaw[:], packet[8:24])
	copy(destinationRaw[:], packet[24:40])
	source := netip.AddrFrom16(sourceRaw)
	destination := netip.AddrFrom16(destinationRaw)
	if icmp[1] != 0 || icmpv6Checksum(source, destination, icmp) != 0 {
		return true, nil
	}
	switch icmp[0] {
	case 135:
		if len(icmp) < 24 {
			return true, nil
		}
		var targetRaw [16]byte
		copy(targetRaw[:], icmp[8:24])
		target := netip.AddrFrom16(targetRaw)
		if target.IsUnspecified() || target.IsMulticast() {
			return true, nil
		}
		optionMAC, hasOption, validOptions := ndpOptionMAC(icmp[24:], 1)
		if !validOptions {
			return true, nil
		}
		if source.IsUnspecified() {
			if hasOption || destination != solicitedNodeMulticast(target) {
				return true, nil
			}
		} else {
			if source.IsMulticast() || source.IsLoopback() || destination != target && destination != solicitedNodeMulticast(target) {
				return true, nil
			}
			if hasOption && optionMAC != frame.Source {
				return true, nil
			}
			if err := l.learnNeighbor(source, frame.Source, true); err != nil {
				return true, err
			}
		}
		if !l.isLocalAddressLocked(target) {
			return true, nil
		}
		return true, l.sendNeighborAdvertisement(target, source, frame.Source)
	case 136:
		if len(icmp) < 24 {
			return true, nil
		}
		var targetRaw [16]byte
		copy(targetRaw[:], icmp[8:24])
		target := netip.AddrFrom16(targetRaw)
		if source.IsUnspecified() || source.IsMulticast() || source.IsLoopback() || target.IsUnspecified() || target.IsMulticast() {
			return true, nil
		}
		if destination.IsUnspecified() || destination.IsMulticast() && destination != netip.MustParseAddr("ff02::1") {
			return true, nil
		}
		flags := binary.BigEndian.Uint32(icmp[4:8])
		if flags&0x40000000 != 0 && destination.IsMulticast() {
			return true, nil
		}
		mac := frame.Source
		optionMAC, hasOption, validOptions := ndpOptionMAC(icmp[24:], 2)
		if !validOptions {
			return true, nil
		}
		if hasOption {
			if optionMAC != frame.Source {
				return true, nil
			}
			mac = optionMAC
		}
		return true, l.learnNeighbor(target, mac, flags&0x20000000 != 0)
	}
	return false, nil
}

// sendNeighborAdvertisement sends an NDP advertisement for a managed address.
func (l *Link) sendNeighborAdvertisement(target, destination netip.Addr, destinationMAC zerotier.MAC) error {
	flags := uint32(0x20000000) // override
	if destination.IsUnspecified() {
		destination = netip.MustParseAddr("ff02::1")
		destinationMAC = ipv6MulticastMAC(destination)
	} else {
		flags |= 0x40000000 // solicited
	}
	localMAC := zerotier.MACForAddress(l.sender.Address(), l.networkID)
	icmp := make([]byte, 32)
	icmp[0] = 136
	binary.BigEndian.PutUint32(icmp[4:8], flags)
	copy(icmp[8:24], target.AsSlice())
	icmp[24], icmp[25] = 2, 1
	macBytes := localMAC.Bytes()
	copy(icmp[26:32], macBytes[:])
	packet := makeIPv6ICMPPacket(target, destination, icmp)
	return l.sender.SendFrame(l.networkID, destinationMAC, zerotier.EtherTypeIPv6, packet)
}

// internetChecksum computes the one's-complement checksum used by IGMP.
func internetChecksum(payload []byte) uint16 {
	var sum uint32
	for len(payload) >= 2 {
		sum += uint32(binary.BigEndian.Uint16(payload[:2]))
		payload = payload[2:]
	}
	if len(payload) != 0 {
		sum += uint32(payload[0]) << 8
	}
	for sum>>16 != 0 {
		sum = sum&0xffff + sum>>16
	}
	return ^uint16(sum)
}

// makeIPv6ICMPPacket builds an IPv6 packet carrying an ICMPv6 message.
func makeIPv6ICMPPacket(source, destination netip.Addr, icmp []byte) []byte {
	packet := make([]byte, 40+len(icmp))
	packet[0] = 0x60
	binary.BigEndian.PutUint16(packet[4:6], uint16(len(icmp)))
	packet[6], packet[7] = 58, 255
	copy(packet[8:24], source.AsSlice())
	copy(packet[24:40], destination.AsSlice())
	copy(packet[40:], icmp)
	binary.BigEndian.PutUint16(packet[42:44], icmpv6Checksum(source, destination, packet[40:]))
	return packet
}

// icmpv6Checksum computes the checksum over an IPv6 pseudo-header and payload.
func icmpv6Checksum(source, destination netip.Addr, payload []byte) uint16 {
	var sum uint32
	add := func(data []byte) {
		for len(data) >= 2 {
			sum += uint32(binary.BigEndian.Uint16(data))
			data = data[2:]
		}
		if len(data) != 0 {
			sum += uint32(data[0]) << 8
		}
	}
	add(source.AsSlice())
	add(destination.AsSlice())
	length := uint32(len(payload))
	sum += length >> 16
	sum += length & 0xffff
	sum += 58
	add(payload)
	for sum>>16 != 0 {
		sum = sum&0xffff + sum>>16
	}
	return ^uint16(sum)
}

// ndpOptionMAC parses one unique source or target link-layer address option.
func ndpOptionMAC(options []byte, wanted byte) (zerotier.MAC, bool, bool) {
	var found zerotier.MAC
	var hasFound bool
	for len(options) != 0 {
		if len(options) < 2 {
			return 0, false, false
		}
		length := int(options[1]) * 8
		if length == 0 || length > len(options) {
			return 0, false, false
		}
		if options[0] == wanted {
			if length != 8 || hasFound {
				return 0, false, false
			}
			mac, err := zerotier.MACFromBytes(options[2:8])
			if err != nil || mac.Uint64() == 0 || mac.IsMulticast() {
				return 0, false, false
			}
			found, hasFound = mac, true
		}
		options = options[length:]
	}
	return found, hasFound, true
}

// solicitedNodeMulticast derives the IPv6 solicited-node address for address.
func solicitedNodeMulticast(address netip.Addr) netip.Addr {
	raw := address.As16()
	var multicast [16]byte
	multicast[0], multicast[1], multicast[11], multicast[12] = 0xff, 0x02, 0x01, 0xff
	copy(multicast[13:], raw[13:])
	return netip.AddrFrom16(multicast)
}

// ipv6MulticastMAC maps an IPv6 multicast address to its Ethernet MAC.
func ipv6MulticastMAC(address netip.Addr) zerotier.MAC {
	raw := address.As16()
	return zerotier.NewMAC(0x333300000000 | uint64(binary.BigEndian.Uint32(raw[12:])))
}

// ipv4MulticastMAC maps an IPv4 multicast address to its Ethernet MAC.
func ipv4MulticastMAC(address netip.Addr) (zerotier.MAC, bool) {
	if !address.Is4() || !address.IsMulticast() {
		return 0, false
	}
	raw := address.As4()
	value := binary.BigEndian.Uint32(raw[:]) & 0x7fffff
	return zerotier.NewMAC(0x01005e000000 | uint64(value)), true
}

// isIPv4BroadcastLocked reports whether address is limited or directed broadcast.
func (l *Link) isIPv4BroadcastLocked(address netip.Addr) bool {
	if !address.Is4() {
		return false
	}
	raw := address.As4()
	value := binary.BigEndian.Uint32(raw[:])
	if value == 0xffffffff {
		return true
	}
	for _, prefix := range l.assigned {
		if !prefix.Addr().Is4() || prefix.Bits() > 30 {
			continue
		}
		prefixRaw := prefix.Addr().As4()
		mask := ^uint32(0) << uint(32-prefix.Bits())
		if value == binary.BigEndian.Uint32(prefixRaw[:])&mask|^mask {
			return true
		}
	}
	return false
}

// isLocalAddressLocked reports whether address is assigned to this link.
func (l *Link) isLocalAddressLocked(address netip.Addr) bool {
	for _, prefix := range l.assigned {
		if prefix.Addr() == address {
			return true
		}
	}
	return false
}

// validIGMPReportSourceLocked applies RFC 9776's narrow exception for the
// exact unspecified address without treating the rest of 0/8 as assigned
// unicast, even if a malformed controller configuration contains it.
func (l *Link) validIGMPReportSourceLocked(address netip.Addr) bool {
	if address.IsUnspecified() {
		return true
	}
	value := address.As4()
	return value[0] != 0 && l.isLocalAddressLocked(address)
}

// cleanNeighborsLocked expires unresolved packet queues. Learned mappings are
// advanced by traffic and ProcessBackgroundTasks after becoming stale.
func (l *Link) cleanNeighborsLocked(now time.Time) {
	for address, pending := range l.neighborPending {
		if now.Sub(pending.createdAt) >= pendingNeighborExpiration {
			l.removePendingNeighborLocked(address)
		}
	}
}

// RunBackgroundTasks maintains neighbor resolution until ctx is canceled.
// A Link used for traffic should run exactly one instance for its lifetime.
func (l *Link) RunBackgroundTasks(ctx context.Context) {
	ticker := time.NewTicker(neighborRequestPeriod)
	defer ticker.Stop()
	for {
		select {
		case now := <-ticker.C:
			_ = l.ProcessBackgroundTasks(now)
		case <-ctx.Done():
			return
		}
	}
}

// ProcessBackgroundTasks retries unresolved ARP and NDP lookups, advances
// delayed neighbor reachability probes, and reconciles multicast subscriptions
// after transient sender failures. It is exposed for embedders that own their
// scheduler.
func (l *Link) ProcessBackgroundTasks(now time.Time) error {
	type request struct {
		address     netip.Addr
		source      netip.Addr
		destination zerotier.MAC
	}
	l.configMu.RLock()
	defer l.configMu.RUnlock()
	if !l.configured {
		return ErrNotConfigured
	}
	var requests []request
	var result error
	l.mu.Lock()
	for address, pending := range l.neighborPending {
		if now.Sub(pending.createdAt) >= pendingNeighborExpiration {
			l.removePendingNeighborLocked(address)
			continue
		}
		if pending.requestedAt.IsZero() || now.Sub(pending.requestedAt) >= neighborRequestPeriod {
			pending.requestedAt = now
			l.neighborPending[address] = pending
			requests = append(requests, request{address: address, source: pending.source})
		}
	}
	for address, entry := range l.neighborCache {
		if entry.state == neighborReachable {
			continue
		}
		mac, usable, probe := l.neighborForSendLocked(address, now)
		if usable && probe {
			requests = append(requests, request{address: address, destination: mac})
		}
	}
	membershipChanged := l.expireQueriedMembershipsLocked(now)
	if l.multicastDirty || membershipChanged {
		result = errors.Join(result, l.syncMulticastGroupsLocked())
	}
	l.mu.Unlock()
	for _, request := range requests {
		result = errors.Join(result, l.sendNeighborProbe(request.source, request.address, request.destination))
	}
	return result
}

// evictOldestNeighborLocked removes the mapping with the oldest state deadline.
// This naturally prefers stale DELAY/PROBE entries over recently learned
// mappings when the bounded cache is full.
func (l *Link) evictOldestNeighborLocked() {
	var oldestAddress netip.Addr
	var oldest time.Time
	for address, entry := range l.neighborCache {
		if oldest.IsZero() || entry.deadline.Before(oldest) {
			oldestAddress, oldest = address, entry.deadline
		}
	}
	if oldestAddress.IsValid() {
		delete(l.neighborCache, oldestAddress)
	}
}

// automaticMulticastSubscriptions returns required all-nodes and solicited-node
// groups for assigned addresses.
func automaticMulticastSubscriptions(assigned []netip.Prefix) map[netip.Addr]zerotier.MulticastGroup {
	automatic := make(map[netip.Addr]zerotier.MulticastGroup, len(assigned)+2)
	for _, prefix := range assigned {
		address := netip.MustParseAddr("224.0.0.1")
		if prefix.Addr().Is6() {
			address = netip.MustParseAddr("ff02::1")
		}
		group, _ := multicastGroupForIP(address)
		automatic[address] = group
		if prefix.Addr().Is6() {
			solicited := solicitedNodeMulticast(prefix.Addr())
			group, _ = multicastGroupForIP(solicited)
			automatic[solicited] = group
		}
	}
	return automatic
}

// syncMulticastGroupsLocked reconciles desired subscriptions with FrameSender.
func (l *Link) syncMulticastGroupsLocked() error {
	return l.reconcileMulticastGroupsLocked(false)
}

// refreshMulticastGroupsLocked reasserts desired groups after a network
// configuration event. A Node may have replaced its per-network state while
// Link's local cache survived, so successful historical subscriptions cannot
// be assumed to still exist.
func (l *Link) refreshMulticastGroupsLocked() error {
	return l.reconcileMulticastGroupsLocked(true)
}

// reconcileMulticastGroupsLocked applies the desired group set. refresh also
// repeats idempotent Subscribe calls for cached groups.
func (l *Link) reconcileMulticastGroupsLocked(refresh bool) error {
	desired := l.activeMulticastGroupsLocked()
	if len(desired) > maxMulticastGroups {
		l.multicastDirty = true
		return errors.New("too many ZeroTier IP multicast groups")
	}
	subscriber, ok := l.sender.(multicastSubscriber)
	if !ok {
		l.activeMulticast = desired
		l.multicastDirty = false
		return nil
	}
	var result error
	for group := range l.activeMulticast {
		if _, exists := desired[group]; !exists {
			if err := subscriber.UnsubscribeMulticast(l.networkID, group); err != nil {
				result = errors.Join(result, err)
				continue
			}
			delete(l.activeMulticast, group)
		}
	}
	for group := range desired {
		_, exists := l.activeMulticast[group]
		if exists && !refresh {
			continue
		}
		if err := subscriber.SubscribeMulticast(l.networkID, group); err != nil {
			result = errors.Join(result, err)
			if refresh {
				delete(l.activeMulticast, group)
			}
			continue
		}
		l.activeMulticast[group] = struct{}{}
	}
	l.multicastDirty = result != nil
	return result
}

// activeMulticastGroupsLocked returns the complete desired subscription set.
func (l *Link) activeMulticastGroupsLocked() map[zerotier.MulticastGroup]struct{} {
	groups := make(map[zerotier.MulticastGroup]struct{}, len(l.reportedMemberships)+len(l.automaticSubscriptions))
	for address, filter := range l.reportedMemberships {
		if !filter.active() {
			continue
		}
		if group, valid := multicastGroupForIP(address); valid {
			groups[group] = struct{}{}
		}
	}
	for _, group := range l.automaticSubscriptions {
		groups[group] = struct{}{}
	}
	return groups
}

// multicastGroupActiveLocked reports whether wanted is required by an
// observed L3 membership or by an automatic link group.
func (l *Link) multicastGroupActiveLocked(wanted zerotier.MulticastGroup) bool {
	for _, group := range l.automaticSubscriptions {
		if group == wanted {
			return true
		}
	}
	for address, filter := range l.reportedMemberships {
		if !filter.active() {
			continue
		}
		if group, valid := multicastGroupForIP(address); valid && group == wanted {
			return true
		}
	}
	return false
}

// canAddReportedMulticastLocked reports whether one newly observed IP group
// fits both the independent report-state bound and the Node's total ZeroTier
// group bound. IP groups that map to an already active MAC consume no new
// Node subscription.
func (l *Link) canAddReportedMulticastLocked(address netip.Addr) bool {
	if _, exists := l.reportedMemberships[address]; exists {
		return true
	}
	if len(l.reportedMemberships) >= maxMulticastGroups {
		return false
	}
	group, valid := multicastGroupForIP(address)
	if !valid {
		return false
	}
	return l.multicastGroupActiveLocked(group) || len(l.activeMulticastGroupsLocked()) < maxMulticastGroups
}

// multicastGroupForIP converts an IP multicast address to a ZeroTier group.
func multicastGroupForIP(address netip.Addr) (zerotier.MulticastGroup, bool) {
	address = address.Unmap()
	if mac, ok := ipv4MulticastMAC(address); ok {
		return zerotier.MulticastGroup{MAC: mac}, true
	}
	if validIPv6MulticastGroup(address) && address.As16()[1]&0x0f > 1 {
		return zerotier.MulticastGroup{MAC: ipv6MulticastMAC(address)}, true
	}
	return zerotier.MulticastGroup{}, false
}

// validIPv6MulticastGroup applies the RFC 4291/RFC 7346 reserved flag and
// scope rules plus the RFC 3306/RFC 3956 dependencies between R, P, and T.
func validIPv6MulticastGroup(address netip.Addr) bool {
	if !address.Is6() || !address.IsMulticast() || address.Zone() != "" {
		return false
	}
	raw := address.As16()
	flags, scope := raw[1]>>4, raw[1]&0x0f
	if scope == 0 || scope == 0x0f || flags&8 != 0 {
		return false
	}
	transient, prefixBased, embeddedRP := flags&1 != 0, flags&2 != 0, flags&4 != 0
	return (!prefixBased || transient) && (!embeddedRP || prefixBased)
}

// inspectInboundIPv4Membership observes valid General Queries and consumes
// legacy Reports before they reach the local host. RFC 4541-style per-port
// report filtering prevents a remote listener from suppressing this host's
// own Report/Leave, while all membership state still crosses the L2/L3
// boundary as validated IGMP packets.
func (l *Link) inspectInboundIPv4Membership(packet []byte) bool {
	if len(packet) < 28 || packet[0]>>4 != 4 || packet[8] != 1 || packet[9] != 2 {
		return false
	}
	headerLength := int(packet[0]&0x0f) * 4
	totalLength := int(binary.BigEndian.Uint16(packet[2:4]))
	if headerLength < 20 || totalLength > len(packet) || totalLength < headerLength+8 ||
		internetChecksum(packet[:headerLength]) != 0 || binary.BigEndian.Uint16(packet[6:8])&ipv4MembershipInvalidFragmentBits != 0 {
		return false
	}
	// Ethernet may pad a short IPv4 packet to its minimum frame size. IP Total
	// Length excludes that padding, so membership validation and checksums must
	// stop at the declared datagram boundary.
	packet = packet[:totalLength]
	igmp := packet[headerLength:totalLength]
	if internetChecksum(igmp) != 0 {
		return false
	}
	routerAlert, validOptions := ipv4MembershipOptions(packet[20:headerLength])
	if !validOptions {
		return false
	}
	source := netip.AddrFrom4([4]byte(packet[12:16]))
	target := netip.AddrFrom4([4]byte(packet[16:20]))
	switch igmp[0] {
	case 0x11: // Membership Query.
		interval, version, general := ipv4MembershipQueryInterval(igmp)
		if !general || !l.validIGMPQuerySourceLocked(source) ||
			version >= 2 && !routerAlert ||
			!l.acceptsMembershipControlDestinationLocked(target, netip.AddrFrom4([4]byte{224, 0, 0, 1})) {
			return false
		}
		l.observeGeneralMembershipQuery(false, l.now(), interval)
		return false
	case 0x12, 0x16: // IGMPv1 or IGMPv2 Membership Report.
		if len(igmp) < 8 || !validIGMPReportSource(source, l.isIPv4BroadcastLocked(source)) ||
			igmp[0] == 0x16 && !routerAlert {
			return false
		}
		group := netip.AddrFrom4([4]byte(igmp[4:8]))
		if _, valid := multicastGroupForIP(group); !valid || !l.acceptsMembershipControlDestinationLocked(target, group) {
			return false
		}
		return true
	default:
		return false
	}
}

// inspectInboundIPv6Membership observes valid General Queries and consumes
// valid MLDv1 Reports for the same per-port suppression reason as
// inspectInboundIPv4Membership. MLDv1 Done is not suppressive and remains
// visible to raw L3 listeners.
func (l *Link) inspectInboundIPv6Membership(packet []byte) bool {
	icmp, protocol, _, ok := ipv6Payload(packet)
	if !ok || protocol != 58 || len(icmp) < 8 || icmp[1] != 0 || packet[7] != 1 || !ipv6MembershipRouterAlert(packet) {
		return false
	}
	var sourceRaw, targetRaw [16]byte
	copy(sourceRaw[:], packet[8:24])
	copy(targetRaw[:], packet[24:40])
	source, target := netip.AddrFrom16(sourceRaw), netip.AddrFrom16(targetRaw)
	if icmpv6Checksum(source, target, icmp) != 0 {
		return false
	}
	switch icmp[0] {
	case 130: // Multicast Listener Query.
		interval, general := ipv6MembershipQueryInterval(icmp)
		if !general || !source.IsLinkLocalUnicast() ||
			!l.acceptsMembershipControlDestinationLocked(target, netip.AddrFrom16([16]byte{0xff, 0x02, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1})) {
			return false
		}
		l.observeGeneralMembershipQuery(true, l.now(), interval)
		return false
	case 131: // MLDv1 Multicast Listener Report.
		if len(icmp) < 24 || !source.IsUnspecified() && !source.IsLinkLocalUnicast() {
			return false
		}
		var groupRaw [16]byte
		copy(groupRaw[:], icmp[8:24])
		group := netip.AddrFrom16(groupRaw)
		if _, valid := multicastGroupForIP(group); !valid || !l.acceptsMembershipControlDestinationLocked(target, group) {
			return false
		}
		return true
	default:
		return false
	}
}

// validIGMPQuerySourceLocked applies the source-address rules needed before a
// Query is allowed to drive passive IGMPv1 membership reconciliation.
func (l *Link) validIGMPQuerySourceLocked(address netip.Addr) bool {
	if !address.Is4() || address.IsUnspecified() || address.IsMulticast() || address.IsLoopback() || l.isIPv4BroadcastLocked(address) {
		return false
	}
	return address.As4()[0] != 0
}

// validIGMPReportSource accepts RFC 9776's exact zero-source exception while
// rejecting other 0/8, multicast, and broadcast sources.
func validIGMPReportSource(address netip.Addr, broadcast bool) bool {
	if !address.Is4() || address.IsMulticast() || address.IsLoopback() || broadcast {
		return false
	}
	if address.IsUnspecified() {
		return true
	}
	return address.As4()[0] != 0
}

// acceptsMembershipControlDestinationLocked applies the assigned-address
// exceptions for IGMP and MLD control packets. The caller holds configMu;
// multicast membership state is read under mu.
func (l *Link) acceptsMembershipControlDestinationLocked(target, expected netip.Addr) bool {
	target = target.Unmap()
	if target == expected || l.isLocalAddressLocked(target) {
		return true
	}
	if !target.IsMulticast() {
		return false
	}
	l.mu.RLock()
	filter := l.reportedMemberships[target]
	_, automatic := l.automaticSubscriptions[target]
	accepted := filter.active() || automatic
	l.mu.RUnlock()
	return accepted
}

// ipv4MembershipQueryInterval recognizes a complete General Query and returns
// its RFC 9776 Group Membership Interval. Queries for a specific group are
// valid protocol traffic but do not age unrelated local memberships.
func ipv4MembershipQueryInterval(igmp []byte) (time.Duration, uint8, bool) {
	if len(igmp) < 8 {
		return 0, 0, false
	}
	group := netip.AddrFrom4([4]byte(igmp[4:8]))
	if len(igmp) == 8 {
		version := uint8(2)
		responseTime := time.Duration(igmp[1]) * 100 * time.Millisecond
		if igmp[1] == 0 {
			version = 1
			responseTime = membershipDefaultResponseTime
		}
		if !group.IsUnspecified() {
			return 0, version, false
		}
		return time.Duration(membershipDefaultRobustness)*membershipDefaultQueryInterval + 2*responseTime, version, true
	}
	if len(igmp) < 12 {
		return 0, 0, false
	}
	sourceCount := int(binary.BigEndian.Uint16(igmp[10:12]))
	if sourceCount > (len(igmp)-12)/4 || !group.IsUnspecified() || sourceCount != 0 {
		return 0, 3, false
	}
	robustness := igmp[8] & 7
	if robustness == 0 {
		robustness = membershipDefaultRobustness
	}
	queryInterval := decodeMembershipCode8(igmp[9], time.Second)
	if queryInterval == 0 {
		queryInterval = membershipDefaultQueryInterval
	}
	responseTime := decodeMembershipCode8(igmp[1], 100*time.Millisecond)
	return time.Duration(robustness)*queryInterval + 2*responseTime, 3, true
}

// ipv6MembershipQueryInterval recognizes a complete General Query and returns
// its RFC 3810 Multicast Address Listening Interval.
func ipv6MembershipQueryInterval(icmp []byte) (time.Duration, bool) {
	if len(icmp) < 24 {
		return 0, false
	}
	var raw [16]byte
	copy(raw[:], icmp[8:24])
	if !netip.AddrFrom16(raw).IsUnspecified() {
		return 0, false
	}
	responseTime := time.Duration(binary.BigEndian.Uint16(icmp[4:6])) * time.Millisecond
	if len(icmp) == 24 {
		return time.Duration(membershipDefaultRobustness)*membershipDefaultQueryInterval + responseTime, true
	}
	if len(icmp) < 28 {
		return 0, false
	}
	sourceCount := int(binary.BigEndian.Uint16(icmp[26:28]))
	if sourceCount > (len(icmp)-28)/16 || sourceCount != 0 {
		return 0, false
	}
	robustness := icmp[24] & 7
	if robustness == 0 {
		robustness = membershipDefaultRobustness
	}
	queryInterval := decodeMembershipCode8(icmp[25], time.Second)
	if queryInterval == 0 {
		queryInterval = membershipDefaultQueryInterval
	}
	responseTime = decodeMembershipCode16(binary.BigEndian.Uint16(icmp[4:6]), time.Millisecond)
	return time.Duration(robustness)*queryInterval + responseTime, true
}

// decodeMembershipCode8 decodes the floating 8-bit Max Resp Code and QQIC
// representation shared by IGMPv3 and MLDv2.
func decodeMembershipCode8(code byte, unit time.Duration) time.Duration {
	value := uint32(code)
	if code >= 128 {
		value = uint32(code&0x0f|0x10) << ((code >> 4 & 7) + 3)
	}
	return time.Duration(value) * unit
}

// decodeMembershipCode16 decodes MLDv2's floating Maximum Response Code.
func decodeMembershipCode16(code uint16, unit time.Duration) time.Duration {
	value := uint32(code)
	if code >= 0x8000 {
		value = uint32(code&0x0fff|0x1000) << ((code >> 12 & 7) + 3)
	}
	return time.Duration(value) * unit
}

// observeGeneralMembershipQuery starts an expiry observation only for groups
// that predate the Query. A subsequent local Report clears the deadline. The
// earlier of overlapping observations wins, so periodic Queries cannot keep a
// stale subscription alive merely by repeatedly moving its deadline forward.
func (l *Link) observeGeneralMembershipQuery(v6 bool, now time.Time, interval time.Duration) {
	deadline := now.Add(interval)
	l.mu.Lock()
	for group, filter := range l.reportedMemberships {
		if group.Is6() != v6 || !filter.active() || filter.lastReport.After(now) {
			continue
		}
		if filter.queryDeadline.IsZero() || deadline.Before(filter.queryDeadline) {
			filter.queryDeadline = deadline
		}
	}
	l.mu.Unlock()
}

// expireQueriedMembershipsLocked removes groups that did not answer a
// validated General Query within the protocol's membership interval. A group
// without a query deadline is retained indefinitely, so a network without a
// querier cannot silently lose active subscriptions.
func (l *Link) expireQueriedMembershipsLocked(now time.Time) bool {
	changed := false
	for group, filter := range l.reportedMemberships {
		if !filter.queryDeadline.IsZero() && !now.Before(filter.queryDeadline) {
			delete(l.reportedMemberships, group)
			changed = true
		}
	}
	return changed
}

// handleIPv4Membership updates subscriptions from IGMP membership traffic.
func (l *Link) handleIPv4Membership(packet []byte) {
	if len(packet) < 20 || packet[9] != 2 || packet[8] != 1 {
		return
	}
	headerLength := int(packet[0]&0x0f) * 4
	if headerLength < 20 || len(packet) < headerLength+8 || internetChecksum(packet[:headerLength]) != 0 {
		return
	}
	source := netip.AddrFrom4([4]byte(packet[12:16]))
	target := netip.AddrFrom4([4]byte(packet[16:20]))
	if binary.BigEndian.Uint16(packet[6:8])&ipv4MembershipInvalidFragmentBits != 0 {
		return
	}
	igmp := packet[headerLength:]
	if internetChecksum(igmp) != 0 {
		return
	}
	routerAlert, validOptions := ipv4MembershipOptions(packet[20:headerLength])
	if !validOptions {
		return
	}
	switch igmp[0] {
	case 0x12, 0x16:
		if len(igmp) < 8 || !l.validIGMPReportSourceLocked(source) {
			return
		}
		if igmp[0] == 0x16 && !routerAlert {
			return
		}
		group := netip.AddrFrom4([4]byte{igmp[4], igmp[5], igmp[6], igmp[7]})
		if target == group {
			l.applyLegacyMembership(group, true)
		}
	case 0x17:
		if len(igmp) < 8 || !l.isLocalAddressLocked(source) {
			return
		}
		if !routerAlert {
			return
		}
		if target == netip.AddrFrom4([4]byte{224, 0, 0, 2}) {
			l.applyLegacyMembership(netip.AddrFrom4([4]byte{igmp[4], igmp[5], igmp[6], igmp[7]}), false)
		}
	case 0x22:
		if !l.validIGMPReportSourceLocked(source) {
			return
		}
		if target != netip.AddrFrom4([4]byte{224, 0, 0, 22}) || !routerAlert {
			return
		}
		count := int(binary.BigEndian.Uint16(igmp[6:8]))
		if count > (len(igmp)-8)/8 {
			return
		}
		records := make([]reportedMembershipRecord, 0, count)
		pos := 8
		for i := 0; i < count; i++ {
			if len(igmp)-pos < 8 {
				return
			}
			recordType := igmp[pos]
			auxLength := int(igmp[pos+1]) * 4
			sourceCount := int(binary.BigEndian.Uint16(igmp[pos+2 : pos+4]))
			length := 8 + sourceCount*4 + auxLength
			if length > len(igmp)-pos {
				return
			}
			recognized := recordType >= 1 && recordType <= 6
			retained := sourceCount
			if !recognized {
				retained = 0
			} else if retained > maxReportedMulticastSources+1 {
				retained = maxReportedMulticastSources + 1
			}
			sources := make([]netip.Addr, 0, retained)
			for sourcePos, sourceIndex := pos+8, 0; sourceIndex < sourceCount; sourcePos, sourceIndex = sourcePos+4, sourceIndex+1 {
				reportedSource := netip.AddrFrom4([4]byte(igmp[sourcePos : sourcePos+4]))
				if recognized && !l.validReportedMulticastSourceLocked(reportedSource, false) {
					return
				}
				if sourceIndex < retained {
					sources = append(sources, reportedSource)
				}
			}
			if recognized {
				group := netip.AddrFrom4([4]byte{igmp[pos+4], igmp[pos+5], igmp[pos+6], igmp[pos+7]})
				records = append(records, reportedMembershipRecord{group: group, recordType: recordType, sources: sources})
			}
			pos += length
		}
		l.applyMembershipRecords(records)
	}
}

// handleIPv6Membership updates subscriptions from MLD membership traffic.
func (l *Link) handleIPv6Membership(packet []byte) {
	icmp, protocol, _, ok := ipv6Payload(packet)
	if !ok || protocol != 58 || len(icmp) < 8 || packet[7] != 1 || icmp[1] != 0 || !ipv6MembershipRouterAlert(packet) {
		return
	}
	var sourceRaw, targetRaw [16]byte
	copy(sourceRaw[:], packet[8:24])
	copy(targetRaw[:], packet[24:40])
	source := netip.AddrFrom16(sourceRaw)
	target := netip.AddrFrom16(targetRaw)
	if !source.IsUnspecified() && (!source.IsLinkLocalUnicast() || !l.isLocalAddressLocked(source)) ||
		icmpv6Checksum(source, target, icmp) != 0 {
		return
	}
	switch icmp[0] {
	case 131, 132:
		if len(icmp) < 24 {
			return
		}
		var raw [16]byte
		copy(raw[:], icmp[8:24])
		group := netip.AddrFrom16(raw)
		expected := group
		if icmp[0] == 132 {
			expected = netip.AddrFrom16([16]byte{0xff, 0x02, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2})
		}
		if target == expected {
			l.applyLegacyMembership(group, icmp[0] == 131)
		}
	case 143:
		if target != netip.AddrFrom16([16]byte{0xff, 0x02, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x16}) {
			return
		}
		count := int(binary.BigEndian.Uint16(icmp[6:8]))
		if count > (len(icmp)-8)/20 {
			return
		}
		records := make([]reportedMembershipRecord, 0, count)
		pos := 8
		for i := 0; i < count; i++ {
			if len(icmp)-pos < 20 {
				return
			}
			recordType := icmp[pos]
			auxLength := int(icmp[pos+1]) * 4
			sourceCount := int(binary.BigEndian.Uint16(icmp[pos+2 : pos+4]))
			length := 20 + sourceCount*16 + auxLength
			if length > len(icmp)-pos {
				return
			}
			recognized := recordType >= 1 && recordType <= 6
			retained := sourceCount
			if !recognized {
				retained = 0
			} else if retained > maxReportedMulticastSources+1 {
				retained = maxReportedMulticastSources + 1
			}
			sources := make([]netip.Addr, 0, retained)
			for sourcePos, sourceIndex := pos+20, 0; sourceIndex < sourceCount; sourcePos, sourceIndex = sourcePos+16, sourceIndex+1 {
				var sourceRaw [16]byte
				copy(sourceRaw[:], icmp[sourcePos:sourcePos+16])
				reportedSource := netip.AddrFrom16(sourceRaw)
				if recognized && !l.validReportedMulticastSourceLocked(reportedSource, true) {
					return
				}
				if sourceIndex < retained {
					sources = append(sources, reportedSource)
				}
			}
			if recognized {
				var raw [16]byte
				copy(raw[:], icmp[pos+4:pos+20])
				group := netip.AddrFrom16(raw)
				records = append(records, reportedMembershipRecord{group: group, recordType: recordType, sources: sources})
			}
			pos += length
		}
		l.applyMembershipRecords(records)
	}
}

// validReportedMulticastSourceLocked recognizes a unicast source-filter
// address that can legitimately appear on this link. The caller holds
// configMu, as all membership parsing runs inside WritePacket.
func (l *Link) validReportedMulticastSourceLocked(address netip.Addr, v6 bool) bool {
	if address.Is4In6() {
		return false
	}
	address = address.Unmap()
	if !address.IsValid() || address.Is6() != v6 || address.IsUnspecified() || address.IsMulticast() || address.IsLoopback() {
		return false
	}
	if address.Is4() {
		return address.As4()[0] != 0 && !l.isIPv4BroadcastLocked(address)
	}
	return true
}

// ipv4MembershipOptions validates the option policy shared with the L3 parser
// and reports a unique, zero-valued RFC 2113 Router Alert. Source routing is
// rejected because observing a report at a destination rewritten by an option
// would not describe membership on this link.
func ipv4MembershipOptions(options []byte) (routerAlert, valid bool) {
	var recordRoute, timestamp bool
	for offset := 0; offset < len(options); {
		kind := options[offset]
		switch kind {
		case 0:
			for _, padding := range options[offset+1:] {
				if padding != 0 {
					return false, false
				}
			}
			return routerAlert, true
		case 1:
			offset++
			continue
		}
		if len(options)-offset < 2 {
			return false, false
		}
		length := int(options[offset+1])
		if length < 2 || length > len(options)-offset {
			return false, false
		}
		switch kind {
		case 131, 137: // Loose and strict source routing.
			return false, false
		case 7: // Record route.
			if recordRoute || length < 3 {
				return false, false
			}
			recordRoute = true
			pointer := int(options[offset+2])
			if pointer < 4 || pointer <= length && pointer+3 > length {
				return false, false
			}
		case 68: // Internet timestamp.
			if timestamp || length < 4 {
				return false, false
			}
			timestamp = true
			pointer := int(options[offset+2])
			if pointer < 5 {
				return false, false
			}
			flag := options[offset+3] & 0x0f
			if pointer <= length {
				required := 4
				if flag == 1 || flag == 3 {
					required = 8
				}
				if pointer+required-1 > length {
					return false, false
				}
			} else if flag != 3 && options[offset+3]>>4 == 15 {
				return false, false
			}
		case 148:
			if routerAlert || length != 4 || options[offset+2] != 0 || options[offset+3] != 0 {
				return false, false
			}
			routerAlert = true
		}
		offset += length
	}
	return routerAlert, true
}

// ipv4MembershipRouterAlert recognizes a Router Alert in a valid option area.
func ipv4MembershipRouterAlert(options []byte) bool {
	routerAlert, valid := ipv4MembershipOptions(options)
	return valid && routerAlert
}

// ipv6MembershipRouterAlert recognizes the zero-valued RFC 2711 option in
// the mandatory first Hop-by-Hop header of an MLD message.
func ipv6MembershipRouterAlert(packet []byte) bool {
	if len(packet) < 48 || packet[6] != 0 {
		return false
	}
	length := (int(packet[41]) + 1) * 8
	if length > len(packet)-40 {
		return false
	}
	header := packet[40 : 40+length]
	found := false
	for offset := 2; offset < len(header); {
		if header[offset] == 0 {
			offset++
			continue
		}
		if len(header)-offset < 2 {
			return false
		}
		optionLength := int(header[offset+1]) + 2
		if optionLength > len(header)-offset {
			return false
		}
		if header[offset] == 5 {
			if found || optionLength != 4 || header[offset+2] != 0 || header[offset+3] != 0 {
				return false
			}
			found = true
		}
		offset += optionLength
	}
	return found
}

// applyLegacyMembership translates an any-source report or leave and resets
// source-filter tracking for the group.
func (l *Link) applyLegacyMembership(group netip.Addr, joined bool) {
	group = group.Unmap()
	if _, valid := multicastGroupForIP(group); !valid {
		return
	}
	now := l.now()
	l.mu.Lock()
	if joined {
		if !l.canAddReportedMulticastLocked(group) {
			l.mu.Unlock()
			return
		}
		l.reportedMemberships[group] = &reportedMulticastFilter{exclude: true, lastReport: now}
	} else {
		delete(l.reportedMemberships, group)
	}
	_ = l.syncMulticastGroupsLocked()
	l.mu.Unlock()
}

// applyMembershipRecords applies one completely parsed report under one lock
// and reconciles the resulting group set once. MODE_IS_INCLUDE and
// CHANGE_TO_INCLUDE_MODE source lists may both span multiple reports, so a
// non-empty snapshot remains conservatively active until an authoritative
// empty mode change is observed.
func (l *Link) applyMembershipRecords(records []reportedMembershipRecord) {
	if len(records) == 0 {
		return
	}
	now := l.now()
	l.mu.Lock()
	// Maintain counts once for the complete report. Rebuilding and scanning
	// every desired group for each record would make a maximum-sized report
	// quadratic in the number of memberships.
	activeCounts := make(map[zerotier.MulticastGroup]int, len(l.reportedMemberships)+len(l.automaticSubscriptions))
	for _, group := range l.automaticSubscriptions {
		activeCounts[group]++
	}
	for address, filter := range l.reportedMemberships {
		if group, valid := multicastGroupForIP(address); valid && filter.active() {
			activeCounts[group]++
		}
	}
	for _, record := range records {
		group := record.group.Unmap()
		zeroTierGroup, valid := multicastGroupForIP(group)
		if !valid {
			continue
		}
		state := l.reportedMemberships[group]
		wasActive := state.active()
		recognized := true
		canCreate := func() bool {
			return state != nil || len(l.reportedMemberships) < maxMulticastGroups &&
				(activeCounts[zeroTierGroup] != 0 || len(activeCounts) < maxMulticastGroups)
		}
		switch record.recordType {
		case 1: // MODE_IS_INCLUDE
			if len(record.sources) == 0 {
				delete(l.reportedMemberships, group)
			} else if state == nil || state.exclude || !state.incomplete {
				if !canCreate() {
					continue
				}
				state = &reportedMulticastFilter{incomplete: true}
				l.reportedMemberships[group] = state
				state.addSources(record.sources)
			} else if state.incomplete {
				state.addSources(record.sources)
			}
		case 2, 4: // MODE_IS_EXCLUDE, CHANGE_TO_EXCLUDE_MODE
			if !canCreate() {
				continue
			}
			state = &reportedMulticastFilter{exclude: true}
			l.reportedMemberships[group] = state
		case 3: // CHANGE_TO_INCLUDE_MODE
			if len(record.sources) == 0 {
				delete(l.reportedMemberships, group)
			} else if !canCreate() {
				continue
			} else {
				// RFC 9776 permits one non-EXCLUDE Group Record to be split
				// across reports. Replace obsolete pre-transition sources, but
				// do not let a later fragment or BLOCK prove the group inactive.
				state = &reportedMulticastFilter{incomplete: true}
				l.reportedMemberships[group] = state
				state.addSources(record.sources)
			}
		case 5: // ALLOW_NEW_SOURCES
			if !canCreate() {
				continue
			}
			if state == nil && len(record.sources) != 0 {
				state = &reportedMulticastFilter{}
				l.reportedMemberships[group] = state
			}
			if state != nil && !state.exclude {
				state.addSources(record.sources)
			}
		case 6: // BLOCK_OLD_SOURCES
			if state != nil && !state.exclude {
				for _, source := range record.sources {
					delete(state.sources, source)
				}
				if !state.incomplete && len(state.sources) == 0 {
					delete(l.reportedMemberships, group)
				}
			}
		default:
			recognized = false
		}
		state = l.reportedMemberships[group]
		if recognized && state != nil {
			state.lastReport = now
			state.queryDeadline = time.Time{}
			if !state.active() {
				delete(l.reportedMemberships, group)
			}
		}
		isActive := l.reportedMemberships[group].active()
		if wasActive == isActive {
			continue
		}
		if isActive {
			activeCounts[zeroTierGroup]++
		} else if activeCounts[zeroTierGroup] <= 1 {
			delete(activeCounts, zeroTierGroup)
		} else {
			activeCounts[zeroTierGroup]--
		}
	}
	_ = l.syncMulticastGroupsLocked()
	l.mu.Unlock()
}

// ipv6Payload validates the IPv6 length and skips supported extension headers.
// fragmented reports an atomic Fragment Header; non-atomic fragments remain
// incomplete and are rejected. Protocol users apply their own RFC policy to
// an otherwise complete atomic packet.
func ipv6Payload(packet []byte) (payload []byte, protocol byte, fragmented, valid bool) {
	if len(packet) < 40 || packet[0]>>4 != 6 {
		return nil, 0, false, false
	}
	payloadLength := int(binary.BigEndian.Uint16(packet[4:6]))
	if payloadLength > len(packet)-40 {
		return nil, 0, false, false
	}
	// Payload Length zero denotes an empty ordinary packet unless a Jumbo
	// Payload option is implemented. Treat any trailing frame padding as
	// padding rather than as an unsupported jumbogram payload.
	end := 40 + payloadLength
	pos, protocol := 40, packet[6]
	seenHop, seenFragment := false, false
	for {
		switch protocol {
		case 0, 43, 60, 135:
			headerType := protocol
			if headerType == 0 {
				if pos != 40 || seenHop {
					return nil, 0, fragmented, false
				}
				seenHop = true
			}
			if end-pos < 8 {
				return nil, 0, fragmented, false
			}
			length := int(packet[pos+1])*8 + 8
			if length > end-pos {
				return nil, 0, fragmented, false
			}
			header := packet[pos : pos+length]
			if (headerType == 0 || headerType == 60) && !validIPv6MembershipOptions(header) ||
				headerType == 43 && packet[pos+3] != 0 {
				return nil, 0, fragmented, false
			}
			protocol = packet[pos]
			pos += length
		case 44:
			if seenFragment || end-pos < 8 || binary.BigEndian.Uint16(packet[pos+2:pos+4])&0xfff9 != 0 {
				return nil, 0, true, false
			}
			fragmented, seenFragment = true, true
			protocol = packet[pos]
			pos += 8
		default:
			return packet[pos:end], protocol, fragmented, true
		}
	}
}

// validIPv6MembershipOptions validates TLV framing and rejects options whose
// RFC 8200 action bits require discarding the packet. Router Alert, Pad1, and
// PadN all use the ordinary skip action and remain valid here.
func validIPv6MembershipOptions(header []byte) bool {
	if len(header) < 8 {
		return false
	}
	for offset := 2; offset < len(header); {
		kind := header[offset]
		if kind == 0 {
			offset++
			continue
		}
		if len(header)-offset < 2 {
			return false
		}
		length := int(header[offset+1]) + 2
		if length > len(header)-offset || kind>>6 != 0 {
			return false
		}
		offset += length
	}
	return true
}

// managedIPv6MAC returns the deterministic virtual MAC for a managed IPv6
// address.
func (l *Link) managedIPv6MAC(address netip.Addr) (zerotier.MAC, bool) {
	l.configMu.RLock()
	defer l.configMu.RUnlock()
	return l.managedIPv6MACLocked(address)
}

// managedIPv6MACLocked resolves a managed IPv6 address without relocking config.
func (l *Link) managedIPv6MACLocked(address netip.Addr) (zerotier.MAC, bool) {
	if !address.Is6() {
		return 0, false
	}
	if !l.configured || l.flags&zerotier.NetworkConfigFlagEnableIPv6NDPEmulation == 0 {
		return 0, false
	}
	for _, prefix := range l.assigned {
		if !prefix.Addr().Is6() || !prefix.Contains(address) {
			continue
		}
		var nodeAddress zerotier.Address
		var ok bool
		switch prefix.Bits() {
		case 88:
			nodeAddress, ok = zerotier.AddressFromRFC4193(l.networkID, address)
		case 40:
			nodeAddress, ok = zerotier.AddressFromSixPlane(l.networkID, address)
		}
		if ok {
			return zerotier.MACForAddress(nodeAddress, l.networkID), true
		}
	}
	return 0, false
}

// routeFor selects the next hop for destination under current configuration.
func (l *Link) routeFor(destination netip.Addr) (netip.Addr, bool) {
	destination = destination.Unmap()
	l.configMu.RLock()
	defer l.configMu.RUnlock()
	return l.routeForLocked(destination)
}

// routeForLocked selects the longest-prefix route or on-link next hop.
func (l *Link) routeForLocked(destination netip.Addr) (netip.Addr, bool) {
	if !l.configured {
		return netip.Addr{}, false
	}
	bestBits := -1
	bestMetric := uint16(^uint16(0))
	nextHop := netip.Addr{}
	for _, route := range l.routes {
		if route.Target.Addr().BitLen() != destination.BitLen() || !route.Target.Contains(destination) {
			continue
		}
		bits := route.Target.Bits()
		if bits > bestBits || (bits == bestBits && route.Metric < bestMetric) {
			bestBits, bestMetric = bits, route.Metric
			nextHop = destination
			if route.Via.IsValid() {
				nextHop = route.Via.Unmap()
			}
		}
	}
	for _, prefix := range l.assigned {
		if prefix.Addr().BitLen() == destination.BitLen() && prefix.Contains(destination) && prefix.Bits() > bestBits {
			bestBits = prefix.Bits()
			nextHop = destination
		}
	}
	return nextHop, bestBits >= 0
}

// validateIPPacket validates IP version, header length, packet length, and MTU.
func validateIPPacket(packet []byte, mtu uint32) (byte, error) {
	if len(packet) < 20 {
		return 0, errors.New("short IP packet")
	}
	if mtu != 0 && uint64(len(packet)) > uint64(mtu) {
		return 0, fmt.Errorf("IP packet length %d exceeds ZeroTier MTU %d", len(packet), mtu)
	}
	version := packet[0] >> 4
	switch version {
	case 4:
		headerLength := int(packet[0]&0x0f) * 4
		if headerLength < 20 || headerLength > len(packet) {
			return 0, errors.New("invalid IPv4 header length")
		}
		totalLength := int(binary.BigEndian.Uint16(packet[2:4]))
		if totalLength < headerLength || totalLength != len(packet) {
			return 0, errors.New("invalid IPv4 packet length")
		}
	case 6:
		if len(packet) < 40 {
			return 0, errors.New("short IPv6 packet")
		}
		payloadLength := int(binary.BigEndian.Uint16(packet[4:6]))
		if payloadLength != len(packet)-40 {
			return 0, errors.New("invalid IPv6 packet length")
		}
	default:
		return 0, errors.New("unsupported IP version")
	}
	return version, nil
}

// normalizeAssignedAddresses validates and deduplicates managed addresses.
func normalizeAssignedAddresses(assigned []netip.Prefix) ([]netip.Prefix, error) {
	normalized := make([]netip.Prefix, 0, len(assigned))
	seen := make(map[netip.Prefix]struct{}, len(assigned))
	for _, prefix := range assigned {
		address := prefix.Addr()
		if !prefix.IsValid() || address.IsUnspecified() || address.IsMulticast() {
			return nil, fmt.Errorf("invalid ZeroTier managed address %s", prefix)
		}
		if _, exists := seen[prefix]; exists {
			continue
		}
		seen[prefix] = struct{}{}
		normalized = append(normalized, prefix)
	}
	return normalized, nil
}

// normalizeRoutes removes invalid routes and routes redundant with local
// assignments.
func normalizeRoutes(routes []zerotier.NetworkRoute, assigned []netip.Prefix) []zerotier.NetworkRoute {
	normalized := make([]zerotier.NetworkRoute, 0, len(routes))
	for _, route := range routes {
		if !route.Target.IsValid() {
			continue
		}
		redundant := false
		for _, local := range assigned {
			if route.Target.Addr().BitLen() == local.Addr().BitLen() && route.Target.Bits() == local.Bits() && route.Target.Contains(local.Addr()) {
				redundant = true
				break
			}
		}
		if redundant {
			continue
		}
		if route.Via.IsValid() {
			route.Via = route.Via.Unmap()
			if route.Via.IsUnspecified() {
				route.Via = netip.Addr{}
			} else {
				if route.Via.BitLen() != route.Target.Addr().BitLen() || route.Via.IsMulticast() || route.Via.IsLoopback() {
					continue
				}
				for _, local := range assigned {
					if route.Via == local.Addr().Unmap() {
						redundant = true
						break
					}
				}
				if redundant {
					continue
				}
			}
		}
		normalized = append(normalized, route)
	}
	return normalized
}

// prefixesEqual compares prefix slices as multisets without requiring order.
func prefixesEqual(left, right []netip.Prefix) bool {
	if len(left) != len(right) {
		return false
	}
	matched := make([]bool, len(right))
	for _, item := range left {
		found := false
		for i, candidate := range right {
			if !matched[i] && item == candidate {
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

// routesEqual compares route slices as multisets without requiring order.
func routesEqual(left, right []zerotier.NetworkRoute) bool {
	if len(left) != len(right) {
		return false
	}
	matched := make([]bool, len(right))
	for _, item := range left {
		found := false
		for i, candidate := range right {
			if !matched[i] && item == candidate {
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
