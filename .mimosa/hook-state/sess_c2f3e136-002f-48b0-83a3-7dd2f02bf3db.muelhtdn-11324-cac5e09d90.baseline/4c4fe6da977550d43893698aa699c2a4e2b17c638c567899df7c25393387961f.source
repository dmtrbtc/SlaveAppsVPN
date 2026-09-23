// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

package zerotier

import (
	"crypto/rand"
	"encoding/binary"
	"errors"
	"fmt"
	"math"
	"net/netip"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"
)

// qosByteOrder matches the native-order QoS record encoding used by ZeroTier
// One on the current architecture.
var qosByteOrder binary.ByteOrder = binary.LittleEndian

func init() {
	switch runtime.GOARCH {
	case "mips", "mips64", "mips64p32", "ppc64", "s390x":
		qosByteOrder = binary.BigEndian
	}
}

const (
	// noFlowID marks packets for which a stable bonding flow cannot be derived.
	noFlowID = int32(-1)
	// bondRoundRobinPackets is the default packet run assigned to one path.
	bondRoundRobinPackets = 64
	// maxBondFlows bounds remembered flow-to-path assignments for one peer.
	maxBondFlows = 64 * 1024
	// qosMeasurementMaxSize bounds one serialized QoS measurement payload.
	qosMeasurementMaxSize = 1400
	// qosMeasurementRecords is the maximum number of ten-byte records in one
	// QoS measurement payload.
	qosMeasurementRecords = qosMeasurementMaxSize / 10
	// qosMaxPendingRecords bounds unsent or unmatched QoS measurement records.
	qosMaxPendingRecords = qosMeasurementRecords * 3
	// qosLatencyWindowSize bounds the rolling path-latency sample window.
	qosLatencyWindowSize = 64
	// qosLatencyMinimum is the sample count required before estimating jitter.
	qosLatencyMinimum = 4
	// bondDefaultFailover is the default maximum silence before a path fails.
	bondDefaultFailover = 5 * time.Second
	// bondMinimumFailover is the shortest accepted failover interval.
	bondMinimumFailover = 500 * time.Millisecond
	// bondOptimizeInterval limits active path changes and quality negotiation.
	bondOptimizeInterval = 15 * time.Second
	// bondDefaultRefractory is the initial penalty after a path becomes
	// ineligible.
	bondDefaultRefractory = 8 * time.Second
	// bondMaximumRefractory caps the repeated-ineligibility penalty.
	bondMaximumRefractory = 10 * time.Minute
	// bondNegotiationWindow bounds one sequence of path utility negotiations.
	bondNegotiationWindow = time.Minute
	// bondNegotiationTries limits transmissions in one negotiation sequence.
	bondNegotiationTries = 3
	// bondMaintenancePeriod is the minimum interval between path-set rebuilds.
	bondMaintenancePeriod = 100 * time.Millisecond
)

// BondingPolicy selects how traffic is distributed over simultaneous direct
// physical paths to a peer.
type BondingPolicy uint8

const (
	// BondingNone uses normal best-path selection without multipath bonding.
	BondingNone BondingPolicy = iota
	// BondingActiveBackup sends through one path and fails over when it becomes
	// unavailable or the configured selection method chooses another link.
	BondingActiveBackup
	// BondingBroadcast duplicates each transmission across every eligible path.
	BondingBroadcast
	// BondingBalanceRoundRobin distributes runs of packets across eligible paths.
	BondingBalanceRoundRobin
	// BondingBalanceXOR keeps a flow on a path selected from its flow identifier.
	BondingBalanceXOR
	// BondingBalanceAware distributes flows using measured path quality and
	// configured link capacity.
	BondingBalanceAware
)

// BondingLinkSelectMethod controls when active-backup returns to another link.
type BondingLinkSelectMethod uint8

const (
	// BondingLinkSelectAlways returns from a backup to an eligible primary link
	// without comparing measured quality.
	BondingLinkSelectAlways BondingLinkSelectMethod = iota
	// BondingLinkSelectBetter returns to an eligible primary only when its
	// measured score is better than the active backup.
	BondingLinkSelectBetter
	// BondingLinkSelectFailure keeps the active link until it fails.
	BondingLinkSelectFailure
	// BondingLinkSelectOptimize periodically switches to a sufficiently better
	// eligible link regardless of primary or spare mode.
	BondingLinkSelectOptimize
)

// ParseBondingLinkSelectMethod parses an embedding-facing active-backup
// selection mode.
func ParseBondingLinkSelectMethod(value string) (BondingLinkSelectMethod, error) {
	switch value {
	case "", "always":
		return BondingLinkSelectAlways, nil
	case "better":
		return BondingLinkSelectBetter, nil
	case "failure":
		return BondingLinkSelectFailure, nil
	case "optimize":
		return BondingLinkSelectOptimize, nil
	default:
		return BondingLinkSelectAlways, errors.New("unknown ZeroTier bonding link select method")
	}
}

// String returns the embedding-facing name of m.
func (m BondingLinkSelectMethod) String() string {
	switch m {
	case BondingLinkSelectAlways:
		return "always"
	case BondingLinkSelectBetter:
		return "better"
	case BondingLinkSelectFailure:
		return "failure"
	case BondingLinkSelectOptimize:
		return "optimize"
	default:
		return fmt.Sprintf("bonding-link-select-method(%d)", uint8(m))
	}
}

// MarshalText returns the embedding-facing name of m for text-based encoders.
func (m BondingLinkSelectMethod) MarshalText() ([]byte, error) {
	return []byte(m.String()), nil
}

// UnmarshalText parses an embedding-facing active-backup selection mode.
func (m *BondingLinkSelectMethod) UnmarshalText(text []byte) error {
	value, err := ParseBondingLinkSelectMethod(string(text))
	if err != nil {
		return err
	}
	*m = value
	return nil
}

// BondingLinkMode assigns an active-backup role to a physical link.
type BondingLinkMode uint8

const (
	// BondingLinkPrimary marks a link as preferred for normal traffic.
	BondingLinkPrimary BondingLinkMode = iota
	// BondingLinkSpare reserves a link for failover when no primary is usable.
	BondingLinkSpare
)

// String returns the embedding-facing name of m.
func (m BondingLinkMode) String() string {
	switch m {
	case BondingLinkPrimary:
		return "primary"
	case BondingLinkSpare:
		return "spare"
	default:
		return fmt.Sprintf("bonding-link-mode(%d)", uint8(m))
	}
}

// MarshalText returns the embedding-facing name of m for text-based encoders.
func (m BondingLinkMode) MarshalText() ([]byte, error) {
	return []byte(m.String()), nil
}

// UnmarshalText parses an embedding-facing physical-link mode.
func (m *BondingLinkMode) UnmarshalText(text []byte) error {
	var value BondingLinkMode
	switch string(text) {
	case "primary":
		value = BondingLinkPrimary
	case "spare":
		value = BondingLinkSpare
	default:
		return fmt.Errorf("invalid ZeroTier bonding link mode %q", text)
	}
	*m = value
	return nil
}

// BondingQuality configures balance-aware path quality limits and weights.
type BondingQuality struct {
	LatencyMax        time.Duration
	JitterMax         time.Duration
	PacketLossMax     float64
	PacketErrorMax    float64
	LatencyWeight     float64
	JitterWeight      float64
	PacketLossWeight  float64
	PacketErrorWeight float64
}

// BondingLink groups local sockets that represent one physical link. The
// embedding may place IPv4 and IPv6 sockets for the same interface in a group.
type BondingLink struct {
	Name         string
	LocalSockets []int64
	Capacity     uint32
	IPPreference uint8
	Mode         BondingLinkMode
	FailoverTo   string
	Disabled     bool
}

// BondingOptions customizes one of the standard bonding policies. A nil
// PacketsPerLink uses the official default of 64; zero selects a path for each
// packet instead of sending a run of packets on one link.
type BondingOptions struct {
	FailoverInterval time.Duration
	UpDelay          time.Duration
	DownDelay        time.Duration
	PacketsPerLink   *int
	LinkSelectMethod BondingLinkSelectMethod
	Quality          BondingQuality
	Links            []BondingLink
}

// ValidateBondingOptions reports whether options can configure a Node.
func ValidateBondingOptions(options BondingOptions) error {
	_, err := normalizeBondingOptions(options)
	return err
}

// defaultBondingOptions returns the protocol-compatible bonding defaults.
func defaultBondingOptions() BondingOptions {
	packetsPerLink := bondRoundRobinPackets
	return BondingOptions{
		FailoverInterval: bondDefaultFailover,
		PacketsPerLink:   &packetsPerLink,
		Quality: BondingQuality{
			LatencyMax: 500 * time.Millisecond, JitterMax: 100 * time.Millisecond,
			PacketLossMax: 0.001, PacketErrorMax: 0.0001,
			LatencyWeight: 0.25, JitterWeight: 0.25, PacketLossWeight: 0.25, PacketErrorWeight: 0.25,
		},
	}
}

// normalizeBondingOptions applies defaults, validates links, and owns slices.
func normalizeBondingOptions(options BondingOptions) (BondingOptions, error) {
	normalized := defaultBondingOptions()
	if options.FailoverInterval != 0 {
		normalized.FailoverInterval = options.FailoverInterval
	}
	if normalized.FailoverInterval < bondMinimumFailover {
		return BondingOptions{}, errors.New("ZeroTier bonding failover interval must be at least 500ms")
	}
	if options.UpDelay < 0 || options.DownDelay < 0 {
		return BondingOptions{}, errors.New("ZeroTier bonding delays must not be negative")
	}
	normalized.UpDelay, normalized.DownDelay = options.UpDelay, options.DownDelay
	if options.PacketsPerLink != nil {
		if *options.PacketsPerLink < 0 || *options.PacketsPerLink > math.MaxUint16 {
			return BondingOptions{}, errors.New("ZeroTier bonding packets per link must be between 0 and 65535")
		}
		packetsPerLink := *options.PacketsPerLink
		normalized.PacketsPerLink = &packetsPerLink
	}
	if options.LinkSelectMethod > BondingLinkSelectOptimize {
		return BondingOptions{}, errors.New("invalid ZeroTier bonding link select method")
	}
	normalized.LinkSelectMethod = options.LinkSelectMethod
	quality := options.Quality
	if quality.LatencyMax != 0 {
		normalized.Quality.LatencyMax = quality.LatencyMax
	}
	if quality.JitterMax != 0 {
		normalized.Quality.JitterMax = quality.JitterMax
	}
	if quality.PacketLossMax != 0 {
		normalized.Quality.PacketLossMax = quality.PacketLossMax
	}
	if quality.PacketErrorMax != 0 {
		normalized.Quality.PacketErrorMax = quality.PacketErrorMax
	}
	weightTotal := quality.LatencyWeight + quality.JitterWeight + quality.PacketLossWeight + quality.PacketErrorWeight
	if weightTotal != 0 {
		if math.Abs(weightTotal-1) > 0.01 || quality.LatencyWeight < 0 || quality.JitterWeight < 0 || quality.PacketLossWeight < 0 || quality.PacketErrorWeight < 0 {
			return BondingOptions{}, errors.New("ZeroTier bonding quality weights must be non-negative and total 1")
		}
		normalized.Quality.LatencyWeight = quality.LatencyWeight
		normalized.Quality.JitterWeight = quality.JitterWeight
		normalized.Quality.PacketLossWeight = quality.PacketLossWeight
		normalized.Quality.PacketErrorWeight = quality.PacketErrorWeight
	}
	if normalized.Quality.LatencyMax <= 0 || normalized.Quality.JitterMax <= 0 || normalized.Quality.PacketLossMax <= 0 || normalized.Quality.PacketErrorMax <= 0 {
		return BondingOptions{}, errors.New("ZeroTier bonding quality limits must be positive")
	}
	normalized.Links = make([]BondingLink, len(options.Links))
	names := make(map[string]struct{}, len(options.Links))
	sockets := make(map[int64]struct{})
	for i, link := range options.Links {
		link.Name = strings.TrimSpace(link.Name)
		if link.Name == "" || len(link.LocalSockets) == 0 {
			return BondingOptions{}, errors.New("ZeroTier bonding links require a name and local sockets")
		}
		if _, exists := names[link.Name]; exists {
			return BondingOptions{}, errors.New("duplicate ZeroTier bonding link name")
		}
		names[link.Name] = struct{}{}
		if link.IPPreference != 0 && link.IPPreference != 4 && link.IPPreference != 6 && link.IPPreference != 46 && link.IPPreference != 64 {
			return BondingOptions{}, errors.New("ZeroTier bonding link IP preference must be 0, 4, 6, 46, or 64")
		}
		if link.Mode > BondingLinkSpare {
			return BondingOptions{}, errors.New("invalid ZeroTier bonding link mode")
		}
		if link.Mode == BondingLinkSpare && link.FailoverTo != "" {
			return BondingOptions{}, errors.New("a spare ZeroTier bonding link cannot define failover-to")
		}
		for _, localSocket := range link.LocalSockets {
			if _, exists := sockets[localSocket]; exists {
				return BondingOptions{}, errors.New("a ZeroTier local socket belongs to multiple bonding links")
			}
			sockets[localSocket] = struct{}{}
		}
		link.LocalSockets = append([]int64(nil), link.LocalSockets...)
		normalized.Links[i] = link
	}
	for _, link := range normalized.Links {
		if link.FailoverTo != "" {
			if _, exists := names[link.FailoverTo]; !exists {
				return BondingOptions{}, errors.New("ZeroTier bonding failover-to references an unknown link")
			}
		}
	}
	return normalized, nil
}

// ParseBondingPolicy parses an embedding-facing multipath policy name.
func ParseBondingPolicy(value string) (BondingPolicy, error) {
	switch value {
	case "", "none":
		return BondingNone, nil
	case "active-backup":
		return BondingActiveBackup, nil
	case "broadcast":
		return BondingBroadcast, nil
	case "balance-rr":
		return BondingBalanceRoundRobin, nil
	case "balance-xor":
		return BondingBalanceXOR, nil
	case "balance-aware":
		return BondingBalanceAware, nil
	default:
		return BondingNone, errors.New("unknown ZeroTier bonding policy")
	}
}

// String returns the embedding-facing name of p.
func (p BondingPolicy) String() string {
	switch p {
	case BondingNone:
		return "none"
	case BondingActiveBackup:
		return "active-backup"
	case BondingBroadcast:
		return "broadcast"
	case BondingBalanceRoundRobin:
		return "balance-rr"
	case BondingBalanceXOR:
		return "balance-xor"
	case BondingBalanceAware:
		return "balance-aware"
	default:
		return fmt.Sprintf("bonding-policy(%d)", uint8(p))
	}
}

// MarshalText returns the embedding-facing name of p for text-based encoders.
func (p BondingPolicy) MarshalText() ([]byte, error) {
	return []byte(p.String()), nil
}

// UnmarshalText parses an embedding-facing multipath policy name.
func (p *BondingPolicy) UnmarshalText(text []byte) error {
	value, err := ParseBondingPolicy(string(text))
	if err != nil {
		return err
	}
	*p = value
	return nil
}

// bondFlow records a flow's assigned path and last use for bounded eviction.
type bondFlow struct {
	path       pathKey
	lastActive time.Time
}

// bondingPolicyForPeerLocked resolves a peer override or the node default.
func (n *Node) bondingPolicyForPeerLocked(peer *peer) BondingPolicy {
	if configured, exists := n.peerPaths[peer.identity.Address()]; exists && configured.BondingPolicySet {
		return configured.BondingPolicy
	}
	return n.bondingPolicy
}

// bondingOptionsForPeerLocked resolves peer-specific or default bond options.
func (n *Node) bondingOptionsForPeerLocked(peer *peer) BondingOptions {
	if configured, exists := n.peerPaths[peer.identity.Address()]; exists && configured.BondingOptions != nil {
		return *configured.BondingOptions
	}
	if n.bondingOptions.PacketsPerLink == nil {
		return defaultBondingOptions()
	}
	return n.bondingOptions
}

// bondQoSIntervalLocked derives the measurement cadence for peer.
func (n *Node) bondQoSIntervalLocked(peer *peer) time.Duration {
	return 2 * n.bondingOptionsForPeerLocked(peer).FailoverInterval
}

// bondedPathsLocked selects physical paths for one outbound packet and uses
// single as storage for the common one-path result.
func (n *Node) bondedPathsLocked(peer *peer, verb Verb, flowID int32, packetID uint64, now time.Time, single []pathKey) []pathKey {
	policy := n.bondingPolicyForPeerLocked(peer)
	if peer.root || policy == BondingNone {
		return singleValidPath(single, n.bestPeerPathLocked(peer, now))
	}
	if policy == BondingBroadcast {
		paths := n.activeDirectPeerPathsLocked(peer, now)
		if len(paths) == 0 {
			return singleValidPath(single, n.bestPeerPathLocked(peer, now))
		}
		if verb == VerbFrame || verb == VerbExtFrame {
			return paths
		}
		return paths[:1]
	}
	options := n.bondingOptionsForPeerLocked(peer)
	paths := peer.bondPaths
	if peer.bondLastMaintenance.IsZero() || now.Sub(peer.bondLastMaintenance) >= bondMaintenancePeriod || peer.bondKnownPathCount != len(peer.paths) {
		paths = n.maintainBondLocked(peer, policy, options, now)
	}
	if len(paths) == 0 {
		return singleValidPath(single, n.bestPeerPathLocked(peer, now))
	}
	if policy == BondingActiveBackup {
		if peer.bondActive.endpoint.IsValid() && containsPath(paths, peer.bondActive) {
			return singleValidPath(single, peer.bondActive)
		}
		return singleValidPath(single, paths[0])
	}
	if policy == BondingBalanceRoundRobin {
		packetsPerLink := *options.PacketsPerLink
		if packetsPerLink == 0 {
			return singleValidPath(single, paths[packetID%uint64(len(paths))])
		}
		if peer.bondRRPackets >= uint64(packetsPerLink) {
			peer.bondRRPackets = 0
			peer.bondRRIndex++
		}
		selected := paths[peer.bondRRIndex%uint64(len(paths))]
		peer.bondRRPackets++
		return singleValidPath(single, selected)
	}
	if flowID == noFlowID {
		return singleValidPath(single, paths[packetID%uint64(len(paths))])
	}
	if flow, ok := peer.bondFlows[flowID]; ok && containsPath(paths, flow.path) && (policy != BondingBalanceAware || !peer.paths[flow.path].bondAvoid) {
		flow.lastActive = now
		peer.bondFlows[flowID] = flow
		return singleValidPath(single, flow.path)
	}
	if flow, ok := peer.bondFlows[flowID]; ok {
		if state := peer.paths[flow.path]; state != nil && state.bondAssignedFlows > 0 {
			state.bondAssignedFlows--
		}
		delete(peer.bondFlows, flowID)
	}
	if len(peer.bondFlows) >= maxBondFlows {
		n.evictOldestBondFlowLocked(peer)
	}
	selected := paths[uint32(flowID)%uint32(len(paths))]
	if policy == BondingBalanceAware {
		selected = awareBondPath(peer, paths, flowID)
	}
	peer.paths[selected].bondAssignedFlows++
	peer.bondFlows[flowID] = bondFlow{path: selected, lastActive: now}
	return singleValidPath(single, selected)
}

// maintainBondLocked refreshes path eligibility, quality, and active selection.
func (n *Node) maintainBondLocked(peer *peer, policy BondingPolicy, options BondingOptions, now time.Time) []pathKey {
	all := make([]pathKey, 0, len(peer.paths))
	for key, state := range peer.paths {
		allowed := bondPathAllowed(key, options)
		if state.bondNominated.IsZero() {
			state.bondNominated = now
			state.bondEligibleAt = now
			state.bondEligible = true
		}
		physicalAge := wirePathAge(state, now)
		alive := physicalAge < options.FailoverInterval
		if alive && !state.bondAlive {
			state.bondAliveSince = now
		}
		state.bondAlive = alive
		inTrial := now.Sub(state.bondNominated) < bondOptimizeInterval
		acceptableAge := physicalAge < options.FailoverInterval+options.DownDelay
		satisfiedUpDelay := !state.bondAliveSince.IsZero() && now.Sub(state.bondAliveSince) >= options.UpDelay
		acceptableQoSAge := (state.lastQoSReceive.IsZero() && inTrial) || (!state.lastQoSReceive.IsZero() && now.Sub(state.lastQoSReceive) < peerPathExpiration)
		if policy == BondingActiveBackup {
			acceptableQoSAge = true
		}
		eligible := allowed && ((acceptableAge && satisfiedUpDelay && acceptableQoSAge) || inTrial)
		if eligible {
			state.bondEligibleAt = now
			if state.bondRefractory > 0 && state.bondAlive {
				drain := now.Sub(state.bondAliveSince)
				if drain >= state.bondRefractory {
					state.bondRefractory = 0
				}
			}
		} else if state.bondEligible {
			if state.bondRefractory == 0 {
				state.bondRefractory = bondDefaultRefractory
			} else {
				state.bondRefractory = minDuration(bondMaximumRefractory, bondDefaultRefractory+2*state.bondRefractory)
			}
			state.bondAvoid = true
		}
		state.bondEligible = eligible
		if eligible {
			all = append(all, key)
		}
	}
	sortBondPaths(all)
	if policy == BondingActiveBackup {
		n.estimateBondQualityLocked(peer, all, options)
		all = n.maintainActiveBackupLocked(peer, all, options, now)
	} else {
		all = selectBondedLinkPaths(peer, all, options)
		n.estimateBondQualityLocked(peer, all, options)
	}
	peer.bondPaths = append(peer.bondPaths[:0], all...)
	peer.bondLastMaintenance = now
	peer.bondKnownPathCount = len(peer.paths)
	return all
}

// bondPathAllowed applies the configured bonding-link policy to key.
func bondPathAllowed(key pathKey, options BondingOptions) bool {
	link, configured := bondingLinkForSocket(options, key.localSocket)
	return configured && !link.Disabled && bondingLinkAllowsAddress(link, key.endpoint.Addr())
}

// bondingLinkForSocket returns the configured physical link for a local socket.
func bondingLinkForSocket(options BondingOptions, localSocket int64) (BondingLink, bool) {
	if len(options.Links) == 0 {
		return BondingLink{Name: strconv.FormatInt(localSocket, 10), LocalSockets: []int64{localSocket}, Capacity: 1}, true
	}
	for _, link := range options.Links {
		for _, configuredSocket := range link.LocalSockets {
			if configuredSocket == localSocket {
				return link, true
			}
		}
	}
	return BondingLink{}, false
}

// bondingLinkAllowsAddress reports whether a link permits an address family.
func bondingLinkAllowsAddress(link BondingLink, address netip.Addr) bool {
	switch link.IPPreference {
	case 4:
		return address.Is4()
	case 6:
		return address.Is6()
	default:
		return true
	}
}

// bondingLinkPrefersAddress reports whether address matches a link's preferred
// family.
func bondingLinkPrefersAddress(link BondingLink, address netip.Addr) bool {
	switch link.IPPreference {
	case 4, 46:
		return address.Is4()
	case 6, 64:
		return address.Is6()
	default:
		return true
	}
}

// selectBondedLinkPaths applies link roles and family preferences to paths.
func selectBondedLinkPaths(peer *peer, paths []pathKey, options BondingOptions) []pathKey {
	if len(paths) == 0 {
		return nil
	}
	havePrimary := false
	for _, key := range paths {
		link, _ := bondingLinkForSocket(options, key.localSocket)
		if link.Mode == BondingLinkPrimary {
			havePrimary = true
			break
		}
	}
	byLink := make(map[string][]pathKey)
	linkOrder := make([]string, 0)
	for _, key := range paths {
		link, _ := bondingLinkForSocket(options, key.localSocket)
		if havePrimary && link.Mode == BondingLinkSpare || !havePrimary && link.Mode != BondingLinkSpare {
			continue
		}
		if _, exists := byLink[link.Name]; !exists {
			linkOrder = append(linkOrder, link.Name)
		}
		byLink[link.Name] = append(byLink[link.Name], key)
	}
	result := make([]pathKey, 0, len(paths))
	for _, name := range linkOrder {
		candidates := byLink[name]
		if len(candidates) == 0 {
			continue
		}
		link, _ := bondingLinkForSocket(options, candidates[0].localSocket)
		if link.IPPreference == 46 || link.IPPreference == 64 {
			preferred := candidates[:0]
			for _, key := range candidates {
				if bondingLinkPrefersAddress(link, key.endpoint.Addr()) {
					preferred = append(preferred, key)
				}
			}
			if len(preferred) != 0 {
				candidates = preferred
			}
		}
		result = append(result, candidates...)
	}
	for _, key := range result {
		peer.paths[key].bondEligible = true
	}
	return result
}

// estimateBondQualityLocked updates normalized path impairment and capacity
// scores.
func (n *Node) estimateBondQualityLocked(peer *peer, paths []pathKey, options BondingOptions) {
	maxCapacity := uint32(0)
	for _, key := range paths {
		link, _ := bondingLinkForSocket(options, key.localSocket)
		if link.Capacity > maxCapacity {
			maxCapacity = link.Capacity
		}
	}
	haveConfiguredCapacity := maxCapacity != 0
	if !haveConfiguredCapacity {
		maxCapacity = 1
	}
	type pathMetrics struct {
		latency     float64
		jitter      float64
		loss        float64
		packetError float64
	}
	metrics := make(map[pathKey]pathMetrics, len(paths))
	maxLatency, maxJitter, maxLoss, maxPacketError := 0.0, 0.0, 0.0, 0.0
	for _, key := range paths {
		state := peer.paths[key]
		link, _ := bondingLinkForSocket(options, key.localSocket)
		capacity := link.Capacity
		if !haveConfiguredCapacity {
			capacity = 1
		}
		state.bondCapacity = float64(capacity) / float64(maxCapacity)
		quality := options.Quality
		metric := pathMetrics{
			latency:     bondMetricScore(float64(state.bondLatency), float64(quality.LatencyMax)),
			jitter:      bondMetricScore(float64(state.jitter), float64(quality.JitterMax)),
			loss:        bondMetricScore(state.loss, quality.PacketLossMax),
			packetError: bondMetricScore(state.packetError, quality.PacketErrorMax),
		}
		metrics[key] = metric
		maxLatency = math.Max(maxLatency, metric.latency)
		maxJitter = math.Max(maxJitter, metric.jitter)
		maxLoss = math.Max(maxLoss, metric.loss)
		maxPacketError = math.Max(maxPacketError, metric.packetError)
		state.bondAvoid = state.bondLatency > quality.LatencyMax || state.jitter > quality.JitterMax || state.loss > quality.PacketLossMax || state.packetError > quality.PacketErrorMax
	}
	total := 0.0
	for _, key := range paths {
		state := peer.paths[key]
		metric := metrics[key]
		quality := options.Quality
		score := quality.LatencyWeight*relativeBondMetric(metric.latency, maxLatency) +
			quality.JitterWeight*relativeBondMetric(metric.jitter, maxJitter) +
			quality.PacketLossWeight*relativeBondMetric(metric.loss, maxLoss) +
			quality.PacketErrorWeight*relativeBondMetric(metric.packetError, maxPacketError)
		state.bondQuality = score * state.bondCapacity
		total += state.bondQuality
	}
	if total > 0 {
		for _, key := range paths {
			peer.paths[key].bondQuality /= total
		}
	}
}

// relativeBondMetric normalizes value against the largest observed score.
func relativeBondMetric(value, maximum float64) float64 {
	if maximum <= 0 {
		return 0
	}
	return value / maximum
}

// bondMetricScore maps a bounded impairment value to an exponential quality
// score.
func bondMetricScore(value, maximum float64) float64 {
	if value < 0 {
		value = 0
	}
	if value > maximum {
		value = maximum
	}
	return math.Exp(-4 * value / maximum)
}

// awareBondPath selects a capacity-eligible path, falling back to best quality.
func awareBondPath(peer *peer, paths []pathKey, flowID int32) pathKey {
	ordered := append([]pathKey(nil), paths...)
	shuffleBondPaths(ordered)
	capacityGate := randomBondFraction(flowID)
	best := ordered[0]
	bestQuality := -1.0
	for _, key := range ordered {
		state := peer.paths[key]
		if !state.bondAvoid && capacityGate <= state.bondCapacity {
			return key
		}
		if state.bondQuality > bestQuality {
			best, bestQuality = key, state.bondQuality
		}
	}
	return best
}

// shuffleBondPaths randomizes equal-candidate ordering using crypto/rand.
func shuffleBondPaths(paths []pathKey) {
	var random [8]byte
	for i := len(paths) - 1; i > 0; i-- {
		if _, err := rand.Read(random[:]); err != nil {
			return
		}
		j := int(binary.BigEndian.Uint64(random[:]) % uint64(i+1))
		paths[i], paths[j] = paths[j], paths[i]
	}
}

// randomBondFraction returns a random capacity gate with a flow-based fallback.
func randomBondFraction(flowID int32) float64 {
	var random [1]byte
	if _, err := rand.Read(random[:]); err == nil {
		return float64(random[0]) / 255
	}
	return float64(uint32(flowID)*2654435761) / float64(math.MaxUint32)
}

// sortBondPaths orders paths deterministically by socket and endpoint.
func sortBondPaths(paths []pathKey) {
	sort.Slice(paths, func(i, j int) bool { return pathKeyLess(paths[i], paths[j]) })
}

// minDuration returns the smaller duration.
func minDuration(a, b time.Duration) time.Duration {
	if a < b {
		return a
	}
	return b
}

// maintainActiveBackupLocked selects and orders the active and failover paths.
func (n *Node) maintainActiveBackupLocked(peer *peer, paths []pathKey, options BondingOptions, now time.Time) []pathKey {
	previousActive := peer.bondActive
	if len(paths) == 0 {
		peer.bondActive = pathKey{}
		peer.bondFailover = nil
		return nil
	}
	explicitFailover := bondingHasFailoverInstructions(options)
	for _, key := range paths {
		state := peer.paths[key]
		link, _ := bondingLinkForSocket(options, key.localSocket)
		score := int(math.Round(state.bondQuality * 255))
		if bondingLinkPrefersAddress(link, key.endpoint.Addr()) {
			score += 500
		}
		if link.Mode == BondingLinkPrimary && (options.LinkSelectMethod != BondingLinkSelectOptimize || explicitFailover) {
			score += 1000
		}
		state.bondScore = score
	}
	// Follow explicit failover chains by placing the target immediately below
	// the source link while preserving any stronger preference it already has.
	for pass := 0; pass < len(options.Links); pass++ {
		for _, source := range paths {
			link, _ := bondingLinkForSocket(options, source.localSocket)
			if link.FailoverTo == "" {
				continue
			}
			for _, target := range paths {
				targetLink, _ := bondingLinkForSocket(options, target.localSocket)
				inheritedScore := peer.paths[source].bondScore - 10
				if !bondingLinkPrefersAddress(targetLink, target.endpoint.Addr()) {
					inheritedScore--
				}
				if targetLink.Name == link.FailoverTo && peer.paths[target].bondScore < inheritedScore {
					peer.paths[target].bondScore = inheritedScore
				}
			}
		}
	}
	ordered := append([]pathKey(nil), paths...)
	sort.SliceStable(ordered, func(i, j int) bool {
		return peer.paths[ordered[i]].bondScore > peer.paths[ordered[j]].bondScore
	})
	hadActive := peer.bondActive.endpoint.IsValid()
	activeValid := peer.bondActive.endpoint.IsValid() && containsPath(ordered, peer.bondActive)
	if !activeValid {
		if hadActive {
			peer.bondActive = ordered[0]
		} else {
			peer.bondActive = initialActiveBackupPath(paths, options)
		}
	}
	if peer.bondNegotiated.endpoint.IsValid() && containsPath(ordered, peer.bondNegotiated) {
		peer.bondActive = peer.bondNegotiated
		peer.paths[peer.bondNegotiated].bondNegotiated = true
		peer.bondNegotiated = pathKey{}
	}
	best := ordered[0]
	if peer.bondActive != best {
		activeLink, _ := bondingLinkForSocket(options, peer.bondActive.localSocket)
		bestLink, _ := bondingLinkForSocket(options, best.localSocket)
		switch options.LinkSelectMethod {
		case BondingLinkSelectAlways:
			if activeLink.Mode != BondingLinkPrimary && bestLink.Mode == BondingLinkPrimary {
				peer.bondActive = best
			}
		case BondingLinkSelectBetter:
			if activeLink.Mode != BondingLinkPrimary && bestLink.Mode == BondingLinkPrimary && peer.paths[best].bondScore > peer.paths[peer.bondActive].bondScore {
				peer.bondActive = best
			}
		case BondingLinkSelectOptimize:
			active := peer.paths[peer.bondActive]
			threshold := int(math.Ceil(active.bondQuality * 255 * 0.10))
			if explicitFailover {
				// Explicit failover chains rank paths independently of measured
				// performance. The quality threshold must not override that order.
				threshold = 0
			}
			if now.Sub(peer.bondLastActiveChange) >= bondOptimizeInterval && peer.paths[best].bondScore-active.bondScore > threshold {
				peer.bondActive = best
			}
		case BondingLinkSelectFailure:
		}
	}
	if previousActive != peer.bondActive {
		peer.bondLastActiveChange = now
		for _, key := range ordered {
			peer.paths[key].bondPacketsIn = 0
			peer.paths[key].bondPacketsOut = 0
		}
	}
	peer.bondFailover = peer.bondFailover[:0]
	for _, key := range ordered {
		if key != peer.bondActive {
			peer.bondFailover = append(peer.bondFailover, key)
		}
	}
	return ordered
}

// bondingHasFailoverInstructions reports whether any link names a failover
// target.
func bondingHasFailoverInstructions(options BondingOptions) bool {
	for _, link := range options.Links {
		if link.FailoverTo != "" {
			return true
		}
	}
	return false
}

// initialActiveBackupPath selects the first active path using link preferences.
func initialActiveBackupPath(paths []pathKey, options BondingOptions) pathKey {
	if len(paths) == 0 || len(options.Links) == 0 {
		if len(paths) == 0 {
			return pathKey{}
		}
		return paths[0]
	}
	var primary pathKey
	for _, key := range paths {
		link, _ := bondingLinkForSocket(options, key.localSocket)
		if link.Mode != BondingLinkPrimary {
			continue
		}
		if !primary.endpoint.IsValid() {
			primary = key
		}
		if bondingLinkPrefersAddress(link, key.endpoint.Addr()) {
			return key
		}
	}
	if primary.endpoint.IsValid() {
		return primary
	}
	return paths[0]
}

// processBondNegotiationLocked exchanges utility proposals for optimize mode.
func (n *Node) processBondNegotiationLocked(peer *peer, options BondingOptions, now time.Time) {
	if options.LinkSelectMethod != BondingLinkSelectOptimize || now.Sub(peer.bondLastNegotiation) < bondOptimizeInterval {
		return
	}
	peer.bondLastNegotiation = now
	var maxInPath, maxOutPath pathKey
	var maxIn, maxOut uint64
	for key, state := range peer.paths {
		if state.bondPacketsIn > maxIn {
			maxIn, maxInPath = state.bondPacketsIn, key
		}
		if state.bondPacketsOut > maxOut {
			maxOut, maxOutPath = state.bondPacketsOut, key
		}
		state.bondPacketsIn, state.bondPacketsOut = 0, 0
	}
	if maxIn == 0 || maxOut == 0 || maxInPath == maxOutPath || peer.paths[maxInPath] == nil || peer.paths[maxOutPath] == nil {
		return
	}
	utility := peer.paths[maxOutPath].bondScore - peer.paths[maxInPath].bondScore
	if peer.paths[maxOutPath].bondNegotiated {
		utility -= 5000
	}
	if utility > math.MaxInt16 {
		utility = math.MaxInt16
	} else if utility < math.MinInt16 {
		utility = math.MinInt16
	}
	peer.bondLocalUtility = int16(utility)
	if now.Sub(peer.bondLastNegotiationTx) > bondNegotiationWindow {
		peer.bondNegotiationTries = 0
	}
	if peer.bondNegotiationTries < bondNegotiationTries && utility >= 0 {
		packet, err := NewPacket(peer.identity.Address(), n.identity.Address(), VerbPathNegotiation)
		if err != nil {
			return
		}
		_ = packet.AppendUint16(uint16(peer.bondLocalUtility))
		if n.sendPacketViaPathLocked(peer, packet, true, maxOutPath, false) == nil {
			peer.bondNegotiationTries++
			peer.bondLastNegotiationTx = now
		}
	} else if peer.bondNegotiationTries >= bondNegotiationTries && utility == 0 && now.Sub(peer.bondLastNegotiationTx) > 2*bondOptimizeInterval {
		peer.bondNegotiated = maxInPath
	}
}

// handlePathNegotiationLocked applies one authenticated peer utility proposal.
func (n *Node) handlePathNegotiationLocked(peer *peer, key pathKey, packet *Packet, now time.Time) error {
	payload := packet.Payload()
	if len(payload) != 2 {
		return nil
	}
	if now.Sub(peer.bondLastNegotiationRx) <= bondNegotiationWindow/maxPeerPaths {
		peer.bondNegotiationRxCount++
	} else {
		peer.bondNegotiationRxCount = 0
	}
	peer.bondLastNegotiationRx = now
	if peer.bondNegotiationRxCount >= maxPeerPaths*2 {
		return nil
	}
	if n.bondingPolicyForPeerLocked(peer) != BondingActiveBackup {
		return nil
	}
	options := n.bondingOptionsForPeerLocked(peer)
	if options.LinkSelectMethod != BondingLinkSelectOptimize {
		return nil
	}
	if peer.bondLastNegotiation.IsZero() {
		return nil
	}
	n.maintainBondLocked(peer, BondingActiveBackup, options, now)
	state := peer.paths[key]
	if state == nil || !state.bondEligible {
		return nil
	}
	remoteUtility := int16(binary.BigEndian.Uint16(payload))
	if remoteUtility > peer.bondLocalUtility || remoteUtility == peer.bondLocalUtility && peer.identity.Address() > n.identity.Address() {
		peer.bondNegotiated = key
		state.bondNegotiated = true
	}
	return nil
}

// activeDirectPeerPathsLocked returns currently eligible direct paths.
func (n *Node) activeDirectPeerPathsLocked(peer *peer, now time.Time) []pathKey {
	paths := make([]pathKey, 0, len(peer.paths))
	for key, state := range peer.paths {
		if wirePathAge(state, now) < peerPathActiveTime {
			paths = append(paths, key)
		}
	}
	sortBondPaths(paths)
	return paths
}

// evictOldestBondFlowLocked removes the least recently active flow assignment.
func (n *Node) evictOldestBondFlowLocked(peer *peer) {
	var oldestID int32
	var oldest time.Time
	for id, flow := range peer.bondFlows {
		if oldest.IsZero() || flow.lastActive.Before(oldest) {
			oldestID, oldest = id, flow.lastActive
		}
	}
	if flow, exists := peer.bondFlows[oldestID]; exists {
		if state := peer.paths[flow.path]; state != nil && state.bondAssignedFlows > 0 {
			state.bondAssignedFlows--
		}
		delete(peer.bondFlows, oldestID)
	}
}

// singleValidPath appends a valid path to caller-provided single-entry storage
// and converts the zero path to nil.
func singleValidPath(storage []pathKey, path pathKey) []pathKey {
	if !path.endpoint.IsValid() {
		return nil
	}
	return append(storage, path)
}

// containsPath reports whether paths contains wanted.
func containsPath(paths []pathKey, wanted pathKey) bool {
	for _, path := range paths {
		if path == wanted {
			return true
		}
	}
	return false
}

// frameFlowID derives the bonding flow identifier from transport ports.
func frameFlowID(frame Frame) int32 {
	protocol, offset, ok := frameTransportOffset(frame.EtherType, frame.Payload)
	if !ok {
		return noFlowID
	}
	switch protocol {
	case 6, 17, 132, 136: // TCP, UDP, SCTP, UDP-Lite
	default:
		return noFlowID
	}
	if len(frame.Payload)-offset < 4 {
		return noFlowID
	}
	sourcePort := uint16(frame.Payload[offset])<<8 | uint16(frame.Payload[offset+1])
	destinationPort := uint16(frame.Payload[offset+2])<<8 | uint16(frame.Payload[offset+3])
	return int32(sourcePort ^ destinationPort ^ uint16(protocol))
}

// frameTransportOffset locates the transport header in an IPv4 or IPv6 frame.
func frameTransportOffset(etherType uint16, packet []byte) (uint8, int, bool) {
	switch etherType {
	case EtherTypeIPv4:
		if len(packet) < 20 || packet[0]>>4 != 4 {
			return 0, 0, false
		}
		offset := int(packet[0]&0x0f) * 4
		if offset < 20 || offset > len(packet) {
			return 0, 0, false
		}
		return packet[9], offset, true
	case EtherTypeIPv6:
		if len(packet) < 40 || packet[0]>>4 != 6 {
			return 0, 0, false
		}
		protocol, offset := packet[6], 40
		for {
			switch protocol {
			case 0, 43, 60, 135: // hop-by-hop, routing, destination, mobility
				if len(packet)-offset < 2 {
					return 0, 0, false
				}
				next := packet[offset]
				offset += (int(packet[offset+1]) + 1) * 8
				protocol = next
			default:
				return protocol, offset, offset <= len(packet)
			}
			if offset > len(packet) {
				return 0, 0, false
			}
		}
	default:
		return 0, 0, false
	}
}

// packetFlowID derives a bonding flow identifier from a frame-bearing packet.
func packetFlowID(packet *Packet) int32 {
	payload := packet.Payload()
	switch packet.Verb() {
	case VerbFrame:
		if len(payload) < 10 {
			return noFlowID
		}
		return frameFlowID(Frame{EtherType: binary.BigEndian.Uint16(payload[8:10]), Payload: payload[10:]})
	case VerbExtFrame:
		if len(payload) < 23 {
			return noFlowID
		}
		return frameFlowID(Frame{EtherType: binary.BigEndian.Uint16(payload[21:23]), Payload: payload[23:]})
	default:
		return noFlowID
	}
}

// packetNetworkID extracts the network ID from verbs whose payload begins with
// one.
func packetNetworkID(packet *Packet) uint64 {
	payload := packet.Payload()
	if len(payload) < 8 {
		return 0
	}
	switch packet.Verb() {
	case VerbFrame, VerbExtFrame, VerbNetworkConfigRequest,
		VerbNetworkConfig, VerbMulticastLike, VerbMulticastGather, VerbMulticastFrame:
		return binary.BigEndian.Uint64(payload[:8])
	default:
		return 0
	}
}

// recordOutgoingBondPacketLocked records QoS and flow state for a transmission.
func (n *Node) recordOutgoingBondPacketLocked(peer *peer, key pathKey, packetID uint64, _ int, verb Verb, _ int32, now time.Time) {
	if n.bondingPolicyForPeerLocked(peer) == BondingNone || peer.root {
		return
	}
	if !bondPathAllowed(key, n.bondingOptionsForPeerLocked(peer)) {
		return
	}
	path := peer.paths[key]
	if path == nil {
		return
	}
	if verb == VerbEcho || verb == VerbFrame || verb == VerbExtFrame {
		path.bondPacketsOut++
	}
	if verb == VerbACK || verb == VerbQoSMeasurement || packetID&1 == 0 {
		return
	}
	if path.qosOutgoing == nil {
		path.qosOutgoing = make(map[uint64]time.Time)
	}
	if len(path.qosOutgoing) < qosMaxPendingRecords {
		path.qosOutgoing[packetID] = now
	}
}

// recordIncomingBondPacketLocked records QoS, flow, and liveness observations.
func (n *Node) recordIncomingBondPacketLocked(peer *peer, key pathKey, packet *Packet, flowID int32, now time.Time) {
	policy := n.bondingPolicyForPeerLocked(peer)
	if policy == BondingNone || peer.root {
		return
	}
	if !bondPathAllowed(key, n.bondingOptionsForPeerLocked(peer)) {
		return
	}
	path := peer.paths[key]
	if path == nil {
		return
	}
	path.packetError *= 0.984375
	if packet.Verb() == VerbEcho || packet.Verb() == VerbFrame || packet.Verb() == VerbExtFrame {
		path.bondPacketsIn++
	}
	if packet.Verb() != VerbACK && packet.Verb() != VerbQoSMeasurement && packet.PacketID()&1 != 0 {
		if path.qosIncoming == nil {
			path.qosIncoming = make(map[uint64]time.Time)
		}
		if len(path.qosIncoming) < qosMaxPendingRecords {
			path.qosIncoming[packet.PacketID()] = now
		}
	}
	if flowID != noFlowID && (policy == BondingBalanceRoundRobin || policy == BondingBalanceXOR || policy == BondingBalanceAware) {
		if _, exists := peer.bondFlows[flowID]; !exists {
			if len(peer.bondFlows) >= maxBondFlows {
				n.evictOldestBondFlowLocked(peer)
			}
			peer.bondFlows[flowID] = bondFlow{path: key, lastActive: now}
			path.bondAssignedFlows++
		}
	}
}

// sendQoSMeasurementsLocked sends pending packet timing records to peer.
func (n *Node) sendQoSMeasurementsLocked(peer *peer, now time.Time) {
	if n.bondingPolicyForPeerLocked(peer) == BondingNone || peer.root {
		return
	}
	options := n.bondingOptionsForPeerLocked(peer)
	interval := n.bondQoSIntervalLocked(peer)
	for key, path := range peer.paths {
		if !bondPathAllowed(key, options) {
			continue
		}
		n.expireQoSRecordsLocked(path, now, 3*interval)
		if len(path.qosIncoming) == 0 || (!path.lastQoSSent.IsZero() && now.Sub(path.lastQoSSent) < interval) {
			continue
		}
		ids := make([]uint64, 0, len(path.qosIncoming))
		for packetID := range path.qosIncoming {
			ids = append(ids, packetID)
		}
		sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
		if len(ids) > qosMeasurementRecords {
			ids = ids[:qosMeasurementRecords]
		}
		packet, err := NewPacket(peer.identity.Address(), n.identity.Address(), VerbQoSMeasurement)
		if err != nil {
			continue
		}
		for _, packetID := range ids {
			// ZeroTier One serializes QoS records in native byte order with memcpy.
			var record [10]byte
			qosByteOrder.PutUint64(record[:8], packetID)
			holding := now.Sub(path.qosIncoming[packetID]) / time.Millisecond
			if holding < 0 {
				holding = 0
			}
			qosByteOrder.PutUint16(record[8:], uint16(holding))
			_ = packet.Append(record[:]...)
			delete(path.qosIncoming, packetID)
		}
		path.lastQoSSent = now
		_ = n.sendPacketViaPathLocked(peer, packet, true, key, false)
	}
}

// handleQoSMeasurementLocked matches peer timing records to local sends.
func (n *Node) handleQoSMeasurementLocked(peer *peer, key pathKey, packet *Packet, now time.Time) error {
	if n.bondingPolicyForPeerLocked(peer) == BondingNone || peer.root {
		return nil
	}
	if !peer.lastQoSRateCheck.IsZero() && now.Sub(peer.lastQoSRateCheck) <= n.bondQoSIntervalLocked(peer)/maxPeerPaths {
		peer.qosRateCount++
	} else {
		peer.qosRateCount = 0
	}
	peer.lastQoSRateCheck = now
	if peer.qosRateCount >= maxPeerPaths*2 {
		return nil
	}
	payload := packet.Payload()
	if len(payload) < 10 || len(payload) > qosMeasurementMaxSize || len(payload)%10 != 0 {
		return nil
	}
	path := peer.paths[key]
	if path == nil {
		return nil
	}
	if !bondPathAllowed(key, n.bondingOptionsForPeerLocked(peer)) {
		return nil
	}
	path.lastQoSReceive = now
	for offset := 0; offset < len(payload); offset += 10 {
		packetID := qosByteOrder.Uint64(payload[offset : offset+8])
		holding := time.Duration(qosByteOrder.Uint16(payload[offset+8:offset+10])) * time.Millisecond
		sentAt, exists := path.qosOutgoing[packetID]
		if !exists {
			continue
		}
		delete(path.qosOutgoing, packetID)
		roundTripMillis := now.Sub(sentAt) / time.Millisecond
		holdingMillis := holding / time.Millisecond
		if roundTripMillis < holdingMillis {
			continue
		}
		sample := time.Duration((roundTripMillis-holdingMillis)/2) * time.Millisecond
		recordQoSLatencySample(path, sample)
		path.loss *= 0.95
	}
	return nil
}

// recordQoSLatencySample updates the rolling path latency and jitter estimates.
func recordQoSLatencySample(path *peerPathState, sample time.Duration) {
	if len(path.qosLatencySamples) < qosLatencyWindowSize {
		path.qosLatencySamples = append(path.qosLatencySamples, sample)
	} else {
		path.qosLatencySamples[path.qosLatencyNext] = sample
		path.qosLatencyNext = (path.qosLatencyNext + 1) % qosLatencyWindowSize
	}
	if len(path.qosLatencySamples) < qosLatencyMinimum {
		return
	}
	var total float64
	for _, latency := range path.qosLatencySamples {
		total += float64(latency)
	}
	mean := total / float64(len(path.qosLatencySamples))
	var squaredDeviation float64
	for _, latency := range path.qosLatencySamples {
		delta := float64(latency) - mean
		squaredDeviation += delta * delta
	}
	path.bondLatency = time.Duration(mean)
	path.jitter = time.Duration(math.Sqrt(squaredDeviation / float64(len(path.qosLatencySamples)-1)))
}

// expireQoSRecordsLocked removes stale unmatched QoS records.
func (n *Node) expireQoSRecordsLocked(path *peerPathState, now time.Time, expiration time.Duration) {
	for packetID, sentAt := range path.qosOutgoing {
		if now.Sub(sentAt) >= expiration {
			delete(path.qosOutgoing, packetID)
			path.loss = path.loss*0.95 + 0.05
		}
	}
	for packetID, receivedAt := range path.qosIncoming {
		if now.Sub(receivedAt) >= expiration {
			delete(path.qosIncoming, packetID)
		}
	}
}
