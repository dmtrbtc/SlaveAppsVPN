// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

package zerotier

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"errors"
	"fmt"
	"net/netip"
	"runtime"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"github.com/metacubex/zerotier-go/internal/ztcrypto"
)

const (
	// ProtocolVersion is the ZeroTier wire protocol version advertised in
	// HELLO packets and network configuration requests.
	ProtocolVersion = 13
	// ProtocolVersionMin is the oldest peer protocol accepted in HELLO and its
	// corresponding OK response.
	ProtocolVersionMin = 4
	// NodeVersionMajor is the advertised ZeroTier One compatibility major
	// version.
	NodeVersionMajor = 1
	// NodeVersionMinor is the advertised ZeroTier One compatibility minor
	// version.
	NodeVersionMinor = 16
	// NodeVersionRevision is the advertised ZeroTier One compatibility patch
	// version.
	NodeVersionRevision = 2
	// nodeVersionMajor is the byte-sized major version serialized on the wire.
	nodeVersionMajor = NodeVersionMajor
	// nodeVersionMinor is the byte-sized minor version serialized on the wire.
	nodeVersionMinor = NodeVersionMinor
	// nodeVersionRev is the uint16 revision serialized on the wire.
	nodeVersionRev = NodeVersionRevision
	// rootContactPeriod is the normal cadence for contacting upstream roots.
	rootContactPeriod = 5 * time.Second
	// rootOfflineTimeout is the root silence that changes an online node offline.
	rootOfflineTimeout = 500 * time.Second
	// networkConfigRefreshPeriod is the normal controller refresh cadence.
	networkConfigRefreshPeriod = 60 * time.Second
	// networkConfigRetryPeriod is the retry cadence before initial configuration.
	networkConfigRetryPeriod = 5 * time.Second
	// peerPathPingPeriod is the keepalive cadence for an active peer path.
	peerPathPingPeriod = 14 * time.Second
	// peerFullHelloPeriod is the cadence for refreshing a peer handshake.
	peerFullHelloPeriod = 60 * time.Second
	// peerPathActiveTime is the receive-age window for preferring a direct path.
	peerPathActiveTime = peerPathPingPeriod + 5*time.Second
	// peerPathExpiration is the receive-age limit for retaining a peer path.
	peerPathExpiration = 243 * time.Second
	// peerPathProbeWindow bounds outstanding and duplicate path probes.
	peerPathProbeWindow = time.Second
	// rootPathPingPeriod is the longest interval between root path probes.
	rootPathPingPeriod = 16 * peerPathPingPeriod
	// maxPeerPaths bounds the physical paths retained for one peer.
	maxPeerPaths = 64
	// maxPushedPathsPerScopeAndFamily bounds each direct-path push category.
	maxPushedPathsPerScopeAndFamily = 8
	// maxPendingIncomingPackets bounds packets waiting for peer identity data.
	maxPendingIncomingPackets = 32
	// maxPendingRequests bounds tracked request identifiers.
	// maxPendingRequests matches the official 256-by-32 expecting-reply ring.
	// New requests replace old expectations at capacity instead of failing the
	// protocol operation that created them.
	maxPendingRequests = 256 * 32
	// maxPendingTransmits bounds payloads waiting for peer discovery.
	maxPendingTransmits = 32
	// maxFragmentAssemblies bounds concurrent fragmented-packet reassembly.
	maxFragmentAssemblies = 32
	// maxDeferredCapabilities bounds capabilities waiting for credentials.
	maxDeferredCapabilities = 64
	// maxDeferredCredentials bounds credential packets waiting for identities.
	maxDeferredCredentials = 32
	// maxLearnedPeers bounds non-root peers held in active memory.
	maxLearnedPeers = 4096
	// maxSurfaceEntries bounds remembered local socket and address surfaces.
	maxSurfaceEntries = 128
	// maxBridgeSpam bounds bridge destinations selected for one unknown MAC.
	maxBridgeSpam = 32
	// maxBridgeRoutes bounds learned virtual MAC-to-bridge routes per network.
	maxBridgeRoutes = 65536
	// bridgeRouteExpiration is the inactivity limit for a learned bridge route.
	bridgeRouteExpiration = 10 * time.Minute
	// pendingIncomingExpiration is the lifetime of a deferred inbound packet.
	pendingIncomingExpiration = 5 * time.Second
	// pendingTransmitExpiration is the lifetime of a deferred outbound payload.
	pendingTransmitExpiration = 5 * time.Second
	// whoisRetryPeriod limits repeated identity discovery requests.
	whoisRetryPeriod = 500 * time.Millisecond
	// deferredCredentialExpiration is the lifetime of deferred credentials.
	deferredCredentialExpiration = 5 * time.Second
	// peerCredentialsRateLimit limits credential packets accepted from a peer.
	peerCredentialsRateLimit = time.Second
	// peerWhoisRateLimit limits WHOIS requests accepted from a peer.
	peerWhoisRateLimit = 100 * time.Millisecond
	// peerGeneralRateLimit supplies rate limits for other peer requests.
	peerGeneralRateLimit = time.Second
	// pushDirectPathsCutoffTime is the window for limiting repeated path pushes.
	pushDirectPathsCutoffTime = 30 * time.Second
	// pushDirectPathsCutoffLimit is the allowed path-push count in one window.
	pushDirectPathsCutoffLimit = 8
	// directPathPushInterval is the cadence when no usable path was advertised.
	directPathPushInterval = 15 * time.Second
	// directPathPushHavePathInterval is the cadence when a usable path exists.
	directPathPushHavePathInterval = 2 * time.Minute
	// peerRouteReportInterval limits diagnostic reports when direct path quality
	// oscillates between otherwise usable endpoints.
	peerRouteReportInterval = time.Second
	// memorizedPathRetryPeriod limits attempts of cached physical paths.
	memorizedPathRetryPeriod = 30 * time.Second
	// learnedPeerExpiration is the inactivity limit for a non-root peer.
	learnedPeerExpiration = 500 * time.Second
	// trustExpiration is the lifetime of peer trust established by credentials.
	trustExpiration = 10 * time.Minute
	// identityValidationBuckets is the power-of-two identity validation limiter
	// table size.
	identityValidationBuckets = 16384
	// unknownPathLatency is the sentinel cost assigned to an unmeasured path.
	unknownPathLatency = 0xffff * time.Millisecond
)

var (
	// ErrWireSenderRequired reports a NodeConfig without physical wire output.
	ErrWireSenderRequired = errors.New("ZeroTier wire sender is required")
	// ErrNodeClosed reports an operation after Node.Close.
	ErrNodeClosed = errors.New("ZeroTier node is closed")
	// ErrUnknownPeer reports traffic that requires an unavailable peer identity.
	ErrUnknownPeer = errors.New("unknown ZeroTier peer")
	// ErrNetworkNotFound reports an operation for a network not joined by the node.
	ErrNetworkNotFound = errors.New("ZeroTier network not found")
	// ErrIdentityCollision reports another node using the local node address.
	ErrIdentityCollision = errors.New("ZeroTier identity collision")
	// errNoPath reports a peer without an eligible physical transmission path.
	errNoPath = errors.New("no ZeroTier path")
)

// tracedPacketError marks an inbound error that has already generated its
// specific remote trace event. It preserves the original error for callers.
type tracedPacketError struct {
	err error
}

// Error returns the underlying traced packet error message.
func (e *tracedPacketError) Error() string { return e.err.Error() }

// Unwrap exposes the underlying traced packet error.
func (e *tracedPacketError) Unwrap() error { return e.err }

// EventType identifies a node, network, peer, or path state transition. Its
// numeric values are library-local and are not ZT_Event ABI values.
type EventType uint8

const (
	// EventNodeUp reports that the protocol core is initialized. Embedding I/O
	// services may not have started yet. It corresponds to the official
	// ZT_EVENT_UP event.
	EventNodeUp EventType = iota + 1
	// EventNodeOnline reports that at least one upstream peer is reachable. It
	// corresponds to the official ZT_EVENT_ONLINE event.
	EventNodeOnline
	// EventNodeOffline reports that upstream connectivity timed out after the
	// node was previously online. It corresponds to the official
	// ZT_EVENT_OFFLINE event.
	EventNodeOffline
	// EventNodeDown reports the final protocol-core shutdown transition. It
	// corresponds to the official ZT_EVENT_DOWN event.
	EventNodeDown
	// EventNodeIdentityCollision reports that an upstream peer detected another
	// node using the local identity. It corresponds to the official
	// ZT_EVENT_FATAL_ERROR_IDENTITY_COLLISION event.
	EventNodeIdentityCollision
	// EventNetworkConfigPending reports that a newly joined or explicitly
	// retried failed network is acquiring configuration. An initial request
	// coincides with the official ZT_NETWORK_STATUS_REQUESTING_CONFIGURATION
	// status; a retry preserves the last controller status until completion.
	EventNetworkConfigPending
	// EventNetworkConfigReady reports that the core accepted an initial network
	// configuration or recovered from a non-ready status. It corresponds to the
	// official ZT_NETWORK_STATUS_OK status and
	// ZT_VIRTUAL_NETWORK_CONFIG_OPERATION_UP operation. The embedding may still
	// need to apply the configuration to its virtual interface.
	EventNetworkConfigReady
	// EventNetworkConfigChanged reports that an already-ready network accepted a
	// changed configuration. It corresponds to the official
	// ZT_VIRTUAL_NETWORK_CONFIG_OPERATION_CONFIG_UPDATE operation.
	EventNetworkConfigChanged
	// EventNetworkAccessDenied reports that the network controller denied this
	// member access. It corresponds to the official
	// ZT_NETWORK_STATUS_ACCESS_DENIED status.
	EventNetworkAccessDenied
	// EventNetworkNotFound reports that the requested network was not found or
	// cannot be configured by this node. It corresponds to the official
	// ZT_NETWORK_STATUS_NOT_FOUND status.
	EventNetworkNotFound
	// EventNetworkAuthenticationRequired reports that the controller requires
	// external authentication before granting network access. It corresponds to
	// the official ZT_NETWORK_STATUS_AUTHENTICATION_REQUIRED status.
	EventNetworkAuthenticationRequired
	// EventNetworkLeft reports that Leave permanently removed a joined network.
	// It corresponds to the official
	// ZT_VIRTUAL_NETWORK_CONFIG_OPERATION_DESTROY operation.
	EventNetworkLeft
	// EventPeerIdentityLearned reports that a peer identity was added to the
	// active peer table. It is a library diagnostic with no official ZT_EVENT
	// equivalent.
	EventPeerIdentityLearned
	// EventPeerPathLearned reports that an unknown physical endpoint completed
	// authenticated path confirmation and entered the peer path table. It
	// corresponds to the official
	// ZT_REMOTE_TRACE_EVENT__PEER_LEARNED_NEW_PATH remote-trace event.
	EventPeerPathLearned
	// EventPeerRouteChanged reports the route selected by the first successfully
	// sent user traffic or a later direct/relayed, direct-endpoint, or bonded-
	// path-count transition. Repeated identical selections are suppressed, and
	// same-kind changes are rate limited and coalesced. It is a library
	// diagnostic with no official ZT_EVENT equivalent.
	EventPeerRouteChanged
	// EventLocalSurfaceChanged reports that a trusted root observed a changed
	// external endpoint and the affected physical paths were invalidated. It
	// corresponds to the official
	// ZT_REMOTE_TRACE_EVENT__RESETTING_PATHS_IN_SCOPE remote-trace event.
	EventLocalSurfaceChanged
)

// String returns the stable diagnostic name of t.
func (t EventType) String() string {
	switch t {
	case EventNodeUp:
		return "node-up"
	case EventNodeOnline:
		return "node-online"
	case EventNodeOffline:
		return "node-offline"
	case EventNodeDown:
		return "node-down"
	case EventNodeIdentityCollision:
		return "node-identity-collision"
	case EventNetworkConfigPending:
		return "network-config-pending"
	case EventNetworkConfigReady:
		return "network-config-ready"
	case EventNetworkConfigChanged:
		return "network-config-changed"
	case EventNetworkAccessDenied:
		return "network-access-denied"
	case EventNetworkNotFound:
		return "network-not-found"
	case EventNetworkAuthenticationRequired:
		return "network-authentication-required"
	case EventNetworkLeft:
		return "network-left"
	case EventPeerIdentityLearned:
		return "peer-identity-learned"
	case EventPeerPathLearned:
		return "peer-path-learned"
	case EventPeerRouteChanged:
		return "peer-route-changed"
	case EventLocalSurfaceChanged:
		return "local-surface-changed"
	default:
		return fmt.Sprintf("event(%d)", uint8(t))
	}
}

// MarshalText returns the stable diagnostic name of t for text-based encoders.
func (t EventType) MarshalText() ([]byte, error) {
	return []byte(t.String()), nil
}

// UnmarshalText parses the stable diagnostic name of an event type.
func (t *EventType) UnmarshalText(text []byte) error {
	var value EventType
	switch string(text) {
	case "node-up":
		value = EventNodeUp
	case "node-online":
		value = EventNodeOnline
	case "node-offline":
		value = EventNodeOffline
	case "node-down":
		value = EventNodeDown
	case "node-identity-collision":
		value = EventNodeIdentityCollision
	case "network-config-pending":
		value = EventNetworkConfigPending
	case "network-config-ready":
		value = EventNetworkConfigReady
	case "network-config-changed":
		value = EventNetworkConfigChanged
	case "network-access-denied":
		value = EventNetworkAccessDenied
	case "network-not-found":
		value = EventNetworkNotFound
	case "network-authentication-required":
		value = EventNetworkAuthenticationRequired
	case "network-left":
		value = EventNetworkLeft
	case "peer-identity-learned":
		value = EventPeerIdentityLearned
	case "peer-path-learned":
		value = EventPeerPathLearned
	case "peer-route-changed":
		value = EventPeerRouteChanged
	case "local-surface-changed":
		value = EventLocalSurfaceChanged
	default:
		return fmt.Errorf("invalid ZeroTier event type %q", text)
	}
	*t = value
	return nil
}

// PeerRoute identifies how user traffic was successfully sent to a peer.
type PeerRoute uint8

const (
	// PeerRouteUnknown indicates that no successful user traffic has selected a
	// route for the peer yet.
	PeerRouteUnknown PeerRoute = iota
	// PeerRouteDirect identifies one or more authenticated direct peer paths.
	PeerRouteDirect
	// PeerRouteRelayed identifies an upstream root path used as a relay.
	PeerRouteRelayed
)

// String returns the stable diagnostic name of r.
func (r PeerRoute) String() string {
	switch r {
	case PeerRouteUnknown:
		return "unknown"
	case PeerRouteDirect:
		return "direct"
	case PeerRouteRelayed:
		return "relayed"
	default:
		return fmt.Sprintf("peer-route(%d)", uint8(r))
	}
}

// MarshalText returns the stable diagnostic name of r for text-based encoders.
func (r PeerRoute) MarshalText() ([]byte, error) {
	return []byte(r.String()), nil
}

// UnmarshalText parses the stable diagnostic name of a peer route.
func (r *PeerRoute) UnmarshalText(text []byte) error {
	var value PeerRoute
	switch string(text) {
	case "unknown":
		value = PeerRouteUnknown
	case "direct":
		value = PeerRouteDirect
	case "relayed":
		value = PeerRouteRelayed
	default:
		return fmt.Errorf("invalid ZeroTier peer route %q", text)
	}
	*r = value
	return nil
}

// PeerRole identifies a peer's role in the ZeroTier trust hierarchy.
type PeerRole uint8

const (
	// PeerRoleLeaf identifies an ordinary node and corresponds to the official
	// ZT_PEER_ROLE_LEAF role.
	PeerRoleLeaf PeerRole = iota
	// PeerRoleMoon identifies a moon root and corresponds to the official
	// ZT_PEER_ROLE_MOON role.
	PeerRoleMoon
	// PeerRolePlanet identifies a planetary root and corresponds to the official
	// ZT_PEER_ROLE_PLANET role.
	PeerRolePlanet
)

// String returns the stable diagnostic name of r.
func (r PeerRole) String() string {
	switch r {
	case PeerRoleLeaf:
		return "leaf"
	case PeerRoleMoon:
		return "moon"
	case PeerRolePlanet:
		return "planet"
	default:
		return fmt.Sprintf("peer-role(%d)", uint8(r))
	}
}

// MarshalText returns the stable diagnostic name of r for text-based encoders.
func (r PeerRole) MarshalText() ([]byte, error) {
	return []byte(r.String()), nil
}

// UnmarshalText parses the stable diagnostic name of a peer role.
func (r *PeerRole) UnmarshalText(text []byte) error {
	var value PeerRole
	switch string(text) {
	case "leaf":
		value = PeerRoleLeaf
	case "moon":
		value = PeerRoleMoon
	case "planet":
		value = PeerRolePlanet
	default:
		return fmt.Errorf("invalid ZeroTier peer role %q", text)
	}
	*r = value
	return nil
}

// Event describes a node, network, peer, or path state transition. Fields that
// do not apply to its Type contain their zero values.
type Event struct {
	// Type identifies the state transition.
	Type EventType
	// NodeAddress identifies the local node that emitted the event.
	NodeAddress Address
	// PeerAddress identifies the peer affected by a peer or path event.
	PeerAddress Address
	// ReporterAddress identifies the trusted peer that reported a local surface
	// change.
	ReporterAddress Address
	// PeerRole identifies the affected or reporting peer's trust role.
	PeerRole PeerRole
	// NetworkID identifies a network-scoped event. Peer paths are node-scoped,
	// so this can be zero even when path confirmation originated on a network.
	NetworkID uint64
	// Route identifies the newly selected peer route.
	Route PeerRoute
	// Endpoint is the new physical endpoint or selected direct path.
	Endpoint netip.AddrPort
	// PreviousEndpoint is the prior external endpoint for a local surface
	// change.
	PreviousEndpoint netip.AddrPort
	// PathCount is the number of selected or invalidated paths represented by
	// the event.
	PathCount int
	// Authentication contains external network authentication details.
	Authentication NetworkAuthenticationInfo
}

// MatchesNodeState reports whether an authoritative network transition still
// describes the node's current joined-network state. Events that do not carry
// an authoritative network result always match. This is intended for
// embeddings that may deliver a serialized event after newer protocol work has
// already committed.
func (e Event) MatchesNodeState(node *Node) bool {
	if node == nil {
		return false
	}
	switch e.Type {
	case EventNetworkConfigReady, EventNetworkConfigChanged:
		network, joined := node.Network(e.NetworkID)
		return joined && network.Status == NetworkStatusOK
	case EventNetworkAccessDenied:
		network, joined := node.Network(e.NetworkID)
		return joined && network.Status == NetworkStatusAccessDenied
	case EventNetworkNotFound:
		network, joined := node.Network(e.NetworkID)
		return joined && network.Status == NetworkStatusNotFound
	case EventNetworkAuthenticationRequired:
		network, joined := node.Network(e.NetworkID)
		return joined && network.Status == NetworkStatusAuthenticationRequired && network.Authentication == e.Authentication
	case EventNetworkLeft:
		_, joined := node.Network(e.NetworkID)
		return !joined
	default:
		return true
	}
}

// NetworkAuthenticationInfo describes external authentication requested by a
// controller.
type NetworkAuthenticationInfo struct {
	Version           uint64
	AuthenticationURL string
	IssuerURL         string
	CentralAuthURL    string
	Nonce             string
	State             string
	ClientID          string
	Provider          string
}

// UserMessage is an application-defined payload received from another node.
// Delivery through NodeConfig.OnUserMessage corresponds to the official
// ZT_EVENT_USER_MESSAGE event.
type UserMessage struct {
	Origin Address
	TypeID uint64
	Data   []byte
}

// RemoteTrace is a structured diagnostic message received from another node.
// Delivery through NodeConfig.OnRemoteTrace corresponds to the official
// ZT_EVENT_REMOTE_TRACE event.
type RemoteTrace struct {
	Origin Address
	Data   string
}

type dataCallbackKind uint8

const (
	// dataCallbackFrame delivers a virtual Ethernet frame.
	dataCallbackFrame dataCallbackKind = iota + 1
	// dataCallbackUserMessage delivers an application-defined node message.
	dataCallbackUserMessage
	// dataCallbackRemoteTrace delivers one remote diagnostic record.
	dataCallbackRemoteTrace
)

// dataCallback retains one high-volume callback without allocating a closure.
// The fields are shared by the three callback kinds: frame uses every field
// except text, user-message uses origin, id, and payload, and remote-trace uses
// origin and text.
type dataCallback struct {
	callback    any
	payload     []byte
	text        string
	id          uint64
	origin      uint64
	destination uint64
	etherType   uint16
	kind        dataCallbackKind
}

// AnyLocalSocket identifies a packet that is not associated with one local
// physical socket and asks WireSender to choose a suitable socket.
const AnyLocalSocket int64 = -1

// WireSender transmits ZeroTier packets over the embedding's physical network.
// localSocket is either AnyLocalSocket or an opaque handle previously supplied
// to ProcessWirePacket. The Node compares and returns handles but never
// interprets their values. Send is invoked synchronously while the Node is
// serializing protocol work and must not call back into the same Node.
type WireSender interface {
	Send(localSocket int64, remote netip.AddrPort, packet []byte) error
}

type WireSenderFunc func(localSocket int64, remote netip.AddrPort, packet []byte) error

// Send calls f with the physical packet transmission request.
func (f WireSenderFunc) Send(localSocket int64, remote netip.AddrPort, packet []byte) error {
	return f(localSocket, remote, packet)
}

// PhysicalPathConfig overrides transport properties for endpoints in Network.
// A non-zero TrustedPathID disables ZeroTier packet encryption and MACs on the
// matching physical network, which must therefore be private and trusted.
type PhysicalPathConfig struct {
	Network       netip.Prefix
	TrustedPathID uint64
	MTU           int
	Blacklist     bool
}

// PeerPathConfig supplies memorized physical endpoints and path exclusions for
// one peer. Hints are retried only when a send has no active direct path.
type PeerPathConfig struct {
	Address          Address
	Try              []netip.AddrPort
	Blacklist        []netip.Prefix
	BondingPolicy    BondingPolicy
	BondingPolicySet bool
	BondingOptions   *BondingOptions
}

// NodeConfig contains callbacks and embedding services for a Node. Store,
// Sender, DirectPaths, PathCheck, and PathLookup are invoked synchronously
// while the Node is serializing protocol work and must not call back into the
// same Node. Event and network-configuration callbacks are invoked serially,
// in protocol-state commit order, after the Node lock is released and may
// safely reenter it. Callbacks caused by reentry run after the current callback
// returns. Frame, user-message, and remote-trace callbacks also run without the
// Node lock and may reenter it, but can run concurrently and have no ordering
// guarantee relative to state callbacks. All callbacks should return promptly.
type NodeConfig struct {
	Identity Identity
	Store    StateStore
	Sender   WireSender
	// Planet replaces the embedded Earth trust anchor when non-nil.
	Planet          *World
	OnEvent         func(Event)
	OnNetworkConfig func(NetworkConfigData)
	OnFrame         func(Frame)
	DirectPaths     func() []netip.AddrPort
	// PathCheck decides whether a candidate physical path may be probed or
	// learned. As in ZeroTier One, changing its result does not revoke paths
	// that have already been authenticated.
	PathCheck      func(Address, int64, netip.AddrPort) bool
	PathLookup     func(Address) []netip.AddrPort
	PhysicalMTU    int
	PhysicalPaths  []PhysicalPathConfig
	PeerPaths      []PeerPathConfig
	BondingPolicy  BondingPolicy
	BondingOptions BondingOptions
	LowBandwidth   bool
	EncryptedHello bool
	// OnUserMessage receives the payload represented by the official
	// ZT_EVENT_USER_MESSAGE event.
	OnUserMessage func(UserMessage)
	// OnRemoteTrace receives the payload represented by the official
	// ZT_EVENT_REMOTE_TRACE event.
	OnRemoteTrace     func(RemoteTrace)
	RemoteTraceTarget Address
	RemoteTraceLevel  uint64
}

// Node is a pure-Go ZeroTier protocol core whose physical and virtual I/O is
// supplied by the embedding application.
type Node struct {
	// mu protects protocol state. fragmentMu protects only incomplete wire
	// packets. Code may acquire fragmentMu while holding mu for bounded cleanup,
	// but must release fragmentMu before acquiring mu on the receive path.
	mu                   sync.Mutex
	fragmentMu           sync.Mutex
	closed               bool
	done                 chan struct{}
	identity             Identity
	store                StateStore
	peerCacheMaintenance peerCacheMaintenance
	sender               WireSender
	onEvent              func(Event)
	onNetworkConfig      func(NetworkConfigData)
	onFrame              func(Frame)
	directPaths          func() []netip.AddrPort
	pathCheck            func(Address, int64, netip.AddrPort) bool
	pathLookup           func(Address) []netip.AddrPort
	physicalMTU          int
	physicalPaths        []PhysicalPathConfig
	peerPaths            map[Address]PeerPathConfig
	bondingPolicy        BondingPolicy
	bondingOptions       BondingOptions
	lowBandwidth         bool
	encryptedHello       bool
	onUserMessage        func(UserMessage)
	onRemoteTrace        func(RemoteTrace)
	remoteTraceTarget    Address
	remoteTraceLevel     uint64
	callbacks            []func()
	dataCallback         dataCallback
	dataCallbacks        []dataCallback
	callbackBatches      [][]func()
	callbackRunning      bool
	planet               World
	moons                map[uint64]World
	moonSeeds            map[uint64]Address
	peers                map[Address]*peer
	pending              map[uint64]pendingRequest
	pendingSlots         [maxPendingRequests]pendingRequestSlot
	pendingSlotCursor    int
	pendingGeneration    uint64
	pendingTransmits     []pendingTransmit
	networks             map[uint64]*Network
	pendingFrames        map[Address][]pendingOutboundFrame
	pendingUserMessages  map[Address][]pendingUserMessage
	pendingRemoteTraces  map[Address][]pendingRemoteTrace
	pendingIncoming      map[Address][]receivedWirePacket
	pendingWhois         map[Address]time.Time
	// wirePaths canonicalizes pre-authentication activity for learned physical
	// paths. Its values outlive concurrent receive lookups during path removal.
	wirePaths            sync.Map // map[pathKey]*wirePathActivity
	fragments            map[uint64]*fragmentAssembly
	fragmentSlots        [maxFragmentAssemblies]*fragmentAssembly
	fragmentSlotCursor   int
	identityChecks       [identityValidationBuckets]time.Time
	deferredCapabilities map[Address][]deferredCapability
	deferredCredentials  map[Address][]deferredCredentialPacket
	surfaces             map[surfaceKey]surfaceState

	lastRootContact      time.Time
	lastRootReceive      time.Time
	lastPeerCacheCleanup time.Time
	online               bool
}

// peer contains the authenticated identity, paths, and protocol state for one
// remote node.
type peer struct {
	identity               Identity
	publicKeyHash          [48]byte
	key                    [SymmetricKeySize]byte
	aesKeys                ztcrypto.GMACSIVKeys
	root                   bool
	role                   PeerRole
	paths                  map[pathKey]*peerPathState
	lastReceive            time.Time
	lastNontrivialReceive  time.Time
	lastFullHello          time.Time
	protocol               uint8
	major                  uint8
	minor                  uint8
	revision               uint16
	credentialsSent        map[uint64]time.Time
	pathProbe              map[pathKey]time.Time
	lastCredentialsReceive time.Time
	lastCredentialsRequest time.Time
	lastWhoisRequest       time.Time
	lastEchoRequest        map[pathKey]time.Time
	lastDirectPathPush     time.Time
	directPathPushCount    int
	lastDirectPathPushSent time.Time
	lastTrustEstablished   time.Time
	lastPathLookup         time.Time
	bondFlows              map[int32]bondFlow
	bondRRIndex            uint64
	bondRRPackets          uint64
	lastQoSRateCheck       time.Time
	qosRateCount           uint16
	bondActive             pathKey
	bondFailover           []pathKey
	bondNegotiated         pathKey
	bondLocalUtility       int16
	bondNegotiationTries   uint8
	bondLastNegotiation    time.Time
	bondLastNegotiationTx  time.Time
	bondLastNegotiationRx  time.Time
	bondNegotiationRxCount uint16
	bondLastActiveChange   time.Time
	bondLastMaintenance    time.Time
	bondPaths              []pathKey
	bondKnownPathCount     int
	reportedUserRoute      PeerRoute
	reportedUserEndpoint   netip.AddrPort
	reportedUserPathCount  int
	lastUserRouteReport    time.Time
	pendingUserRoute       PeerRoute
	pendingUserEndpoint    netip.AddrPort
	pendingUserPathCount   int
}

// peerPathState contains liveness, quality, and bonding state for one physical
// peer path.
type peerPathState struct {
	activity          *wirePathActivity
	lastReceive       time.Time
	lastSend          time.Time
	latency           time.Duration
	latencyMeasured   bool
	bondLatency       time.Duration
	lastProbe         time.Time
	priority          int
	qosIncoming       map[uint64]time.Time
	qosOutgoing       map[uint64]time.Time
	lastQoSSent       time.Time
	lastQoSReceive    time.Time
	qosLatencySamples []time.Duration
	qosLatencyNext    int
	jitter            time.Duration
	loss              float64
	packetError       float64
	bondNominated     time.Time
	bondAliveSince    time.Time
	bondEligibleAt    time.Time
	bondAlive         bool
	bondEligible      bool
	bondAvoid         bool
	bondNegotiated    bool
	bondRefractory    time.Duration
	bondQuality       float64
	bondCapacity      float64
	bondScore         int
	bondAssignedFlows uint16
	bondPacketsIn     uint64
	bondPacketsOut    uint64
}

// pathKey uniquely identifies a physical path by local socket and endpoint.
type pathKey struct {
	localSocket int64
	endpoint    netip.AddrPort
}

// wirePathActivity is the canonical physical activity for one local socket
// and remote endpoint. receiveOrigin retains Go's monotonic clock and
// lastReceiveElapsedMillis is updated before packet validation. lastSend and
// references are changed only under Node.mu.
type wirePathActivity struct {
	receiveOrigin            time.Time
	lastReceiveElapsedMillis atomic.Int64
	lastSend                 time.Time
	references               int
}

// newWirePathActivity initializes physical receive time before publication.
func newWirePathActivity(now time.Time) *wirePathActivity {
	activity := &wirePathActivity{receiveOrigin: now}
	activity.lastReceiveElapsedMillis.Store(1)
	return activity
}

// receive advances the physical receive clock without allowing concurrent or
// out-of-order packet processing to move it backwards.
func (activity *wirePathActivity) receive(now time.Time) {
	elapsed := now.Sub(activity.receiveOrigin)
	if elapsed < 0 {
		return
	}
	receivedAt := int64(elapsed/time.Millisecond) + 1
	for {
		previous := activity.lastReceiveElapsedMillis.Load()
		if receivedAt <= previous || activity.lastReceiveElapsedMillis.CompareAndSwap(previous, receivedAt) {
			return
		}
	}
}

// lastReceive returns the latest physical receive time with its monotonic
// component intact.
func (activity *wirePathActivity) lastReceive() (time.Time, bool) {
	elapsed := activity.lastReceiveElapsedMillis.Load()
	if elapsed == 0 || activity.receiveOrigin.IsZero() {
		return time.Time{}, false
	}
	return activity.receiveOrigin.Add(time.Duration(elapsed-1) * time.Millisecond), true
}

// pathKeyLess supplies a stable order in place of the official core's fixed
// peer-path slots.
func pathKeyLess(left, right pathKey) bool {
	if left.localSocket != right.localSocket {
		return left.localSocket < right.localSocket
	}
	if comparison := left.endpoint.Addr().Compare(right.endpoint.Addr()); comparison != 0 {
		return comparison < 0
	}
	return left.endpoint.Port() < right.endpoint.Port()
}

// addPeerPathLocked attaches a peer path to the canonical physical activity
// for its local socket and endpoint. The caller must hold Node.mu.
func (n *Node) addPeerPathLocked(peer *peer, key pathKey, state *peerPathState, now time.Time) {
	if peer.paths[key] != nil {
		n.deletePeerPathLocked(peer, key)
	}
	created := newWirePathActivity(now)
	value, _ := n.wirePaths.LoadOrStore(key, created)
	activity := value.(*wirePathActivity)
	activity.receive(now)
	if activity.lastSend.Before(state.lastSend) {
		activity.lastSend = state.lastSend
	}
	activity.references++
	state.activity = activity
	peer.paths[key] = state
}

// deletePeerPathLocked releases one peer reference to a physical path. A
// receive operation that already loaded the activity may finish updating its
// detached value, which is harmless. The caller must hold Node.mu.
func (n *Node) deletePeerPathLocked(peer *peer, key pathKey) {
	state := peer.paths[key]
	if state == nil {
		return
	}
	delete(peer.paths, key)
	activity := state.activity
	if activity == nil {
		return
	}
	if activity.references > 0 {
		activity.references--
	}
	if activity.references == 0 {
		n.wirePaths.Delete(key)
	}
}

// noteWirePathReceive records physical activity before packet validation, as
// ZeroTier One does for Path::_lastIn. Unknown endpoints are not retained.
func (n *Node) noteWirePathReceive(key pathKey, now time.Time) {
	if value, ok := n.wirePaths.Load(key); ok {
		value.(*wirePathActivity).receive(now)
	}
}

// wirePathAge returns the physical receive age used by Path::quality and
// Path::alive. It falls back to authenticated receive time for synthetic test
// paths that were not installed through addPeerPathLocked.
func wirePathAge(path *peerPathState, now time.Time) time.Duration {
	if path.activity != nil {
		if lastReceive, ok := path.activity.lastReceive(); ok {
			age := now.Sub(lastReceive)
			if age < 0 {
				return 0
			}
			return age
		}
	}
	age := now.Sub(path.lastReceive)
	if age < 0 {
		return 0
	}
	return age
}

// wirePathLastReceive returns the canonical physical receive time reported by
// the public peer diagnostics. The per-peer value remains a fallback for
// synthetic paths not installed through Node.
func wirePathLastReceive(path *peerPathState) time.Time {
	if path.activity != nil {
		if lastReceive, ok := path.activity.lastReceive(); ok {
			return lastReceive
		}
	}
	return path.lastReceive
}

// wirePathLastSend returns the canonical physical send time. The per-peer
// value remains a fallback for synthetic paths not installed through Node.
func wirePathLastSend(path *peerPathState) time.Time {
	if path.activity != nil && !path.activity.lastSend.IsZero() {
		return path.activity.lastSend
	}
	return path.lastSend
}

// noteWirePathSendLocked records successful physical output on path. The
// caller must hold Node.mu.
func (n *Node) noteWirePathSendLocked(key pathKey, now time.Time) {
	if value, ok := n.wirePaths.Load(key); ok {
		activity := value.(*wirePathActivity)
		if activity.lastSend.Before(now) {
			activity.lastSend = now
		}
	}
}

// surfaceKey identifies an observed local socket and address-family surface.
type surfaceKey struct {
	reporter Address
	path     pathKey
	scope    int
}

// surfaceState records the most recently observed endpoint for a surface.
type surfaceState struct {
	endpoint netip.AddrPort
	updated  time.Time
	trusted  bool
}

// pushedDirectPath records a recently advertised peer endpoint and probe time.
type pushedDirectPath struct {
	endpoint netip.AddrPort
	forget   bool
	cluster  bool
}

// receivedWirePacket retains an inbound packet awaiting peer identity data.
type receivedWirePacket struct {
	localSocket   int64
	remote        netip.AddrPort
	data          []byte
	receivedAt    time.Time
	lastTried     time.Time
	authenticated bool
}

// fragmentAssembly holds the received pieces of one fragmented wire packet.
type fragmentAssembly struct {
	active         bool
	packetID       uint64
	slot           int
	storage        [MaxPacketSize]byte
	used           int
	head           []byte
	fragments      [7][]byte
	total          int
	localSocket    int64
	remote         netip.AddrPort
	createdAt      time.Time
	headReceivedAt time.Time
}

// pendingRequest tracks an outbound request awaiting an OK or ERROR response.
type pendingRequest struct {
	verb       Verb
	peer       Address
	networkID  uint64
	sentAt     time.Time
	path       pathKey
	priority   int
	replyPaths *pendingReplyPaths
	slot       int
	generation uint64
}

// pendingRequestSlot identifies the map entry owned by one fixed-ring slot.
// The generation prevents a stale slot from deleting a reused packet ID.
type pendingRequestSlot struct {
	packetID   uint64
	generation uint64
}

// pendingReplyPaths identifies successful physical copies that have not yet
// produced a response. It is allocated only when one request is broadcast.
type pendingReplyPaths struct {
	remaining map[pathKey]struct{}
}

// pendingTransmit holds an outbound packet until peer discovery completes.
type pendingTransmit struct {
	packet    *Packet
	encrypt   bool
	flowID    int32
	createdAt time.Time
}

// deferredCapability holds a capability until prerequisite credentials arrive.
type deferredCapability struct {
	networkID uint64
	value     Capability
	sender    Address
	received  time.Time
}

// deferredCredentialPacket holds credentials until signer identity is known.
type deferredCredentialPacket struct {
	sender   Address
	payload  []byte
	received time.Time
}

// pendingOutboundFrame retains a virtual frame awaiting destination discovery.
type pendingOutboundFrame struct {
	frame         Frame
	extended      bool
	extendedFlags byte
	payloadLength int
	flowID        int32
	createdAt     time.Time
}

// pendingUserMessage retains an application message awaiting a peer path.
type pendingUserMessage struct {
	typeID    uint64
	data      []byte
	createdAt time.Time
}

// PeerPath is a diagnostic snapshot of one physical path to a peer.
type PeerPath struct {
	// LocalSocket is the embedding-owned opaque handle for this physical path.
	LocalSocket int64
	// Endpoint is the remote physical UDP endpoint.
	Endpoint netip.AddrPort
	// LastSend is the last time a wire packet used this path.
	LastSend time.Time
	// LastReceive is the last time a physical wire packet arrived on this path.
	LastReceive time.Time
	// Active reports whether the core currently considers the path usable. An
	// embedding that tunnels wire packets must describe that transport context
	// separately because the protocol core sees the original remote endpoint.
	Active bool
	// Preferred reports whether the core currently selects this direct path.
	Preferred bool
	// Priority is the path preference learned from direct-path negotiation.
	Priority int
	// TrustedPathID is non-zero when matching physical-path policy disables
	// ZeroTier packet encryption and authentication on this path.
	TrustedPathID uint64
	// Latency is the smoothed path round-trip time.
	Latency time.Duration
	// Jitter is the measured path latency variation.
	Jitter time.Duration
	// PacketLoss is the measured packet loss ratio from zero through one.
	PacketLoss float64
	// PacketError is the measured packet error ratio from zero through one.
	PacketError float64
}

// PeerStatus is a diagnostic snapshot of one known peer and its paths.
type PeerStatus struct {
	// Address is the peer's ZeroTier node address.
	Address Address
	// Role identifies the peer's role in the ZeroTier trust hierarchy.
	Role PeerRole
	// Protocol is the highest protocol version observed from the peer.
	Protocol uint8
	// VersionMajor is the peer software major version.
	VersionMajor int
	// VersionMinor is the peer software minor version.
	VersionMinor int
	// VersionRevision is the peer software revision.
	VersionRevision int
	// Paths contains independently owned physical-path snapshots.
	Paths []PeerPath
}

// NetworkStatus describes the core's controller configuration state for a
// joined network. It does not report whether an embedding has applied the
// configuration to a virtual interface. Its numeric values are library-local;
// official statuses not represented here leave no numeric gaps.
type NetworkStatus uint8

const (
	// NetworkStatusRequestingConfiguration indicates that no usable controller
	// configuration has been accepted yet. It corresponds to the official
	// ZT_NETWORK_STATUS_REQUESTING_CONFIGURATION status.
	NetworkStatusRequestingConfiguration NetworkStatus = iota
	// NetworkStatusOK indicates that the core has accepted a usable network
	// configuration. It corresponds to the official ZT_NETWORK_STATUS_OK status.
	NetworkStatusOK
	// NetworkStatusAccessDenied indicates that the controller rejected this
	// member. It corresponds to the official ZT_NETWORK_STATUS_ACCESS_DENIED
	// status.
	NetworkStatusAccessDenied
	// NetworkStatusNotFound indicates that the network was not found or cannot
	// be configured by this node. It corresponds to the official
	// ZT_NETWORK_STATUS_NOT_FOUND status.
	NetworkStatusNotFound
	// NetworkStatusAuthenticationRequired indicates that external authentication
	// must complete before the controller grants access. It corresponds to the
	// official ZT_NETWORK_STATUS_AUTHENTICATION_REQUIRED status.
	NetworkStatusAuthenticationRequired
)

// String returns the stable diagnostic name of s.
func (s NetworkStatus) String() string {
	switch s {
	case NetworkStatusRequestingConfiguration:
		return "requesting-configuration"
	case NetworkStatusOK:
		return "ok"
	case NetworkStatusAccessDenied:
		return "access-denied"
	case NetworkStatusNotFound:
		return "not-found"
	case NetworkStatusAuthenticationRequired:
		return "authentication-required"
	default:
		return fmt.Sprintf("network-status(%d)", uint8(s))
	}
}

// MarshalText returns the stable diagnostic name of s for text-based encoders.
func (s NetworkStatus) MarshalText() ([]byte, error) {
	return []byte(s.String()), nil
}

// UnmarshalText parses the stable diagnostic name of a network status.
func (s *NetworkStatus) UnmarshalText(text []byte) error {
	var value NetworkStatus
	switch string(text) {
	case "requesting-configuration":
		value = NetworkStatusRequestingConfiguration
	case "ok":
		value = NetworkStatusOK
	case "access-denied":
		value = NetworkStatusAccessDenied
	case "not-found":
		value = NetworkStatusNotFound
	case "authentication-required":
		value = NetworkStatusAuthenticationRequired
	default:
		return fmt.Errorf("invalid ZeroTier network status %q", text)
	}
	*s = value
	return nil
}

// Network is a snapshot of joined-network status and accepted configuration.
type Network struct {
	ID                     uint64
	Status                 NetworkStatus
	Config                 NetworkConfigData
	assemblies             map[uint64]*configAssembly
	members                map[Address]CertificateOfMembership
	ownership              map[Address][]CertificateOfOwnership
	tags                   map[Address][]Tag
	capabilities           map[Address][]Capability
	revocations            map[Address]map[uint64]uint64
	associated             map[Address]time.Time
	bridgeRoutes           map[MAC]bridgeRoute
	multicast              map[MulticastGroup]map[Address]time.Time
	pendingMulticast       map[MulticastGroup][]pendingMulticastFrame
	multicastSubscriptions map[MulticastGroup]struct{}
	lastMulticastGather    map[MulticastGroup]time.Time
	multicastAnnouncements map[Address]time.Time
	lastConfigUpdateID     uint64
	configUpdateSerial     uint64
	reportNextFailure      bool
	LastConfigRequest      time.Time
	LastConfigReceive      time.Time
	Authentication         NetworkAuthenticationInfo
}

// bridgeRoute is a learned virtual MAC-to-bridge mapping.
type bridgeRoute struct {
	bridge  Address
	learned time.Time
}

// pendingMulticastFrame retains multicast data while member discovery runs.
type pendingMulticastFrame struct {
	frame               Frame
	origin              Address
	sent                map[Address]struct{}
	targets             map[Address]struct{}
	gatherLimit         uint32
	bridgesOutsideLimit bool
	createdAt           time.Time
}

// NewNode loads or creates identity state and initializes the protocol core.
func NewNode(config NodeConfig) (*Node, error) {
	if config.Sender == nil {
		return nil, ErrWireSenderRequired
	}
	physicalPathMTU := config.PhysicalMTU
	if physicalPathMTU == 0 {
		physicalPathMTU = DefaultPhysicalMTU
	}
	if physicalPathMTU < MinPhysicalMTU || physicalPathMTU > MaxPhysicalMTU {
		return nil, fmt.Errorf("ZeroTier physical MTU must be between %d and %d", MinPhysicalMTU, MaxPhysicalMTU)
	}
	if config.BondingPolicy > BondingBalanceAware {
		return nil, errors.New("invalid ZeroTier bonding policy")
	}
	bondingOptions, err := normalizeBondingOptions(config.BondingOptions)
	if err != nil {
		return nil, err
	}
	if !config.RemoteTraceTarget.IsZero() && config.RemoteTraceTarget.IsReserved() {
		return nil, errors.New("invalid ZeroTier remote trace target")
	}
	physicalPaths := make([]PhysicalPathConfig, len(config.PhysicalPaths))
	for i, physicalPath := range config.PhysicalPaths {
		if !physicalPath.Network.IsValid() {
			return nil, errors.New("invalid ZeroTier physical path network")
		}
		physicalPath.Network = physicalPath.Network.Masked()
		if physicalPath.MTU != 0 && (physicalPath.MTU < MinPhysicalMTU || physicalPath.MTU > MaxPhysicalMTU) {
			return nil, fmt.Errorf("ZeroTier physical path MTU must be between %d and %d", MinPhysicalMTU, MaxPhysicalMTU)
		}
		physicalPaths[i] = physicalPath
	}
	peerPaths := make(map[Address]PeerPathConfig, len(config.PeerPaths))
	for _, peerPath := range config.PeerPaths {
		if peerPath.Address.IsZero() || peerPath.Address.IsReserved() {
			return nil, errors.New("invalid ZeroTier peer path address")
		}
		if len(peerPath.Try) > maxPeerPaths || len(peerPath.Blacklist) > maxPeerPaths {
			return nil, errors.New("too many ZeroTier peer path entries")
		}
		if peerPath.BondingPolicySet && peerPath.BondingPolicy > BondingBalanceAware {
			return nil, errors.New("invalid ZeroTier peer bonding policy")
		}
		configured := PeerPathConfig{
			Address: peerPath.Address, Try: append([]netip.AddrPort(nil), peerPath.Try...), Blacklist: append([]netip.Prefix(nil), peerPath.Blacklist...),
			BondingPolicy: peerPath.BondingPolicy, BondingPolicySet: peerPath.BondingPolicySet,
		}
		if peerPath.BondingOptions != nil {
			normalized, normalizeErr := normalizeBondingOptions(*peerPath.BondingOptions)
			if normalizeErr != nil {
				return nil, fmt.Errorf("invalid ZeroTier peer bonding options for %s: %w", peerPath.Address, normalizeErr)
			}
			configured.BondingOptions = &normalized
		}
		for _, endpoint := range configured.Try {
			if !endpoint.IsValid() || endpoint.Port() == 0 || pathScope(endpoint.Addr()) == 0 {
				return nil, errors.New("invalid ZeroTier peer path hint")
			}
		}
		for i, network := range configured.Blacklist {
			if !network.IsValid() {
				return nil, errors.New("invalid ZeroTier peer path blacklist")
			}
			configured.Blacklist[i] = network.Masked()
		}
		peerPaths[configured.Address] = configured
	}
	store := config.Store
	if store == nil {
		store = NewMemoryStore()
	}
	peerCacheMaintenance, _ := store.(peerCacheMaintenance)
	identity := config.Identity
	if identity.Address().IsZero() {
		var err error
		identity, err = loadOrCreateIdentity(store)
		if err != nil {
			return nil, err
		}
	} else {
		if !identity.HasPrivate() {
			return nil, ErrPrivateKey
		}
		if err := identity.Validate(); err != nil {
			return nil, err
		}
	}
	planet, err := initialPlanet(config.Planet)
	if err != nil {
		return nil, err
	}
	if cached, err := loadStoredWorld(store, planetStateName()); err == nil {
		if cached.Type == WorldTypePlanet && cached.ID == planet.ID && cached.Timestamp >= planet.Timestamp && cached.validateRoots() == nil {
			planet = cached
		}
	}
	n := &Node{
		done:                 make(chan struct{}),
		identity:             identity,
		store:                store,
		peerCacheMaintenance: peerCacheMaintenance,
		sender:               config.Sender,
		onEvent:              config.OnEvent,
		onNetworkConfig:      config.OnNetworkConfig,
		onFrame:              config.OnFrame,
		directPaths:          config.DirectPaths,
		pathCheck:            config.PathCheck,
		pathLookup:           config.PathLookup,
		physicalMTU:          physicalPathMTU,
		physicalPaths:        physicalPaths,
		peerPaths:            peerPaths,
		bondingPolicy:        config.BondingPolicy,
		bondingOptions:       bondingOptions,
		lowBandwidth:         config.LowBandwidth,
		encryptedHello:       config.EncryptedHello,
		onUserMessage:        config.OnUserMessage,
		onRemoteTrace:        config.OnRemoteTrace,
		remoteTraceTarget:    config.RemoteTraceTarget,
		remoteTraceLevel:     config.RemoteTraceLevel,
		planet:               planet,
		moons:                make(map[uint64]World),
		moonSeeds:            make(map[uint64]Address),
		peers:                make(map[Address]*peer),
		pending:              make(map[uint64]pendingRequest),
		networks:             make(map[uint64]*Network),
		pendingFrames:        make(map[Address][]pendingOutboundFrame),
		pendingUserMessages:  make(map[Address][]pendingUserMessage),
		pendingRemoteTraces:  make(map[Address][]pendingRemoteTrace),
		pendingIncoming:      make(map[Address][]receivedWirePacket),
		pendingWhois:         make(map[Address]time.Time),
		fragments:            make(map[uint64]*fragmentAssembly),
		deferredCapabilities: make(map[Address][]deferredCapability),
		deferredCredentials:  make(map[Address][]deferredCredentialPacket),
		surfaces:             make(map[surfaceKey]surfaceState),
	}
	n.emitLocked(Event{Type: EventNodeUp})
	for _, root := range planet.Roots {
		if err := n.addPeerLocked(root.Identity, true); err != nil {
			return nil, err
		}
	}
	n.runCallbacks()
	return n, nil
}

// loadOrCreateIdentity restores a valid secret identity or persists a new one.
func loadOrCreateIdentity(store StateStore) (Identity, error) {
	if data, _ := store.Get(identitySecretStateName); len(data) != 0 {
		identity, err := ParseIdentity(string(data))
		if err != nil {
			return Identity{}, err
		}
		if err := identity.Validate(); err != nil {
			return Identity{}, err
		}
		if public, _ := store.Get(identityPublicStateName); len(public) != 0 && string(public) != identity.PublicString() {
			_ = store.Put(identityPublicStateName, []byte(identity.PublicString()))
		}
		return identity, nil
	}
	identity, err := GenerateIdentity()
	if err != nil {
		return Identity{}, err
	}
	_ = store.Put(identitySecretStateName, []byte(identity.SecretString()))
	_ = store.Put(identityPublicStateName, []byte(identity.PublicString()))
	return identity, nil
}

// Address returns the local node address.
func (n *Node) Address() Address { return n.identity.Address() }

// Identity returns the local identity, including private material when present.
func (n *Node) Identity() Identity { return n.identity }

// Planet returns an independently owned snapshot of the active planet.
func (n *Node) Planet() World {
	n.mu.Lock()
	planet := cloneWorld(n.planet)
	n.mu.Unlock()
	return planet
}

// Close prevents further protocol work and flushes persistent peer hints.
func (n *Node) Close() error {
	n.mu.Lock()
	if n.closed {
		n.mu.Unlock()
		return nil
	}
	n.closed = true
	if n.done != nil {
		close(n.done)
	}
	n.fragmentMu.Lock()
	for packetID, assembly := range n.fragments {
		n.removeFragmentAssemblyLocked(packetID, assembly)
	}
	n.fragmentMu.Unlock()
	n.savePeerCacheLocked()
	n.emitLocked(Event{Type: EventNodeDown})
	n.unlockAndRunCallbacks()
	return nil
}

// Orbit adds a federated root world. If a cached moon is unavailable, seed is
// contacted through the planet and must identify itself as one of that moon's
// roots before the world is accepted.
func (n *Node) Orbit(worldID uint64, seed Address) error {
	if worldID == 0 || (!seed.IsZero() && seed.IsReserved()) {
		return ErrInvalidWorld
	}
	n.mu.Lock()
	defer n.unlockAndRunCallbacks()
	if n.closed {
		return ErrNodeClosed
	}
	if _, ok := n.moons[worldID]; ok {
		return nil
	}
	if cached, err := loadStoredWorld(n.store, moonStateName(worldID)); err == nil {
		if cached.Type == WorldTypeMoon && cached.ID == worldID && cached.validateRoots() == nil {
			return n.addWorldLocked(cached, true)
		}
	}
	if !seed.IsZero() {
		n.moonSeeds[worldID] = seed
		n.requestWhoisLocked(seed, time.Now())
	}
	return nil
}

// Deorbit removes a moon and its persisted topology from the node.
func (n *Node) Deorbit(worldID uint64) error {
	n.mu.Lock()
	defer n.unlockAndRunCallbacks()
	if n.closed {
		return ErrNodeClosed
	}
	delete(n.moons, worldID)
	delete(n.moonSeeds, worldID)
	n.refreshTopologyRootsLocked()
	_ = n.store.Delete(moonStateName(worldID))
	return nil
}

// Moons returns independently owned snapshots ordered by world ID.
func (n *Node) Moons() []World {
	n.mu.Lock()
	moons := make([]World, 0, len(n.moons))
	for _, moon := range n.moons {
		moons = append(moons, cloneWorld(moon))
	}
	n.mu.Unlock()
	sort.Slice(moons, func(i, j int) bool { return moons[i].ID < moons[j].ID })
	return moons
}

// cloneWorld returns an independently owned copy of world.
func cloneWorld(world World) World {
	cloned := world
	cloned.Roots = append([]WorldRoot(nil), world.Roots...)
	for i := range cloned.Roots {
		cloned.Roots[i].Endpoints = append([]netip.AddrPort(nil), world.Roots[i].Endpoints...)
	}
	return cloned
}

// initialPlanet selects and validates the configured or embedded planet.
func initialPlanet(configured *World) (World, error) {
	if configured == nil {
		return DefaultPlanet()
	}
	planet := cloneWorld(*configured)
	if planet.Type != WorldTypePlanet || planet.validateRoots() != nil {
		return World{}, ErrInvalidWorld
	}
	return planet, nil
}

// PeerIdentity returns a known or cached public identity for address.
func (n *Node) PeerIdentity(address Address) (Identity, bool) {
	n.mu.Lock()
	defer n.unlockAndRunCallbacks()
	if n.closed {
		return Identity{}, false
	}
	peer := n.loadPeerCacheLocked(address, time.Now())
	var identity Identity
	if peer != nil {
		identity = peer.identity
	}
	return identity, peer != nil
}

// Online reports whether root traffic has been received recently.
func (n *Node) Online() bool {
	n.mu.Lock()
	online := n.online
	n.mu.Unlock()
	return online
}

// Join creates network state, loads cached configuration, and contacts the
// controller.
func (n *Node) Join(networkID uint64) error {
	if networkID == 0 || (!IsAdHocNetworkID(networkID) && Controller(networkID).IsReserved()) {
		return errors.New("invalid ZeroTier network ID")
	}
	n.mu.Lock()
	defer n.unlockAndRunCallbacks()
	if n.closed {
		return ErrNodeClosed
	}
	if _, exists := n.networks[networkID]; exists {
		return nil
	}
	network := newNetwork(networkID)
	n.networks[networkID] = network
	n.emitLocked(Event{Type: EventNetworkConfigPending, NetworkID: networkID})
	n.loadCachedNetworkConfigLocked(network)
	return n.requestNetworkConfigLocked(networkID, time.Now())
}

// RefreshNetwork immediately requests a fresh configuration for a joined
// network. A failed network emits configuration-pending and arms its next
// controller failure for delivery, while its public status remains the last
// authoritative controller result until the request completes.
func (n *Node) RefreshNetwork(networkID uint64) error {
	n.mu.Lock()
	defer n.unlockAndRunCallbacks()
	if n.closed {
		return ErrNodeClosed
	}
	network := n.networks[networkID]
	if network == nil {
		return ErrNetworkNotFound
	}
	retryingFailure := network.Status != NetworkStatusOK && network.Status != NetworkStatusRequestingConfiguration
	if retryingFailure {
		network.reportNextFailure = true
		n.emitLocked(Event{Type: EventNetworkConfigPending, NetworkID: networkID})
	}
	err := n.requestNetworkConfigLocked(networkID, time.Now())
	if err != nil && retryingFailure {
		network.reportNextFailure = false
	}
	return err
}

// Leave removes a joined network and its cached configuration.
func (n *Node) Leave(networkID uint64) error {
	n.mu.Lock()
	defer n.unlockAndRunCallbacks()
	if n.closed {
		return ErrNodeClosed
	}
	if n.networks[networkID] == nil {
		return nil
	}
	delete(n.networks, networkID)
	n.emitLocked(Event{Type: EventNetworkLeft, NetworkID: networkID})
	_ = n.store.Delete(networkStateName(networkID))
	return nil
}

// SendUserMessage sends an arbitrary VL1 message, resolving an unknown peer
// through WHOIS when necessary.
func (n *Node) SendUserMessage(destination Address, typeID uint64, data []byte) error {
	n.mu.Lock()
	defer n.unlockAndRunCallbacks()
	if n.closed {
		return ErrNodeClosed
	}
	if destination.IsReserved() || destination == n.identity.Address() {
		return ErrInvalidAddress
	}
	if len(data) > MaxPacketSize-PacketMinSize-8 {
		return ErrInvalidPacket
	}
	now := time.Now()
	peer := n.loadPeerCacheLocked(destination, now)
	if peer == nil {
		if n.pendingUserMessageCountLocked() >= maxPendingFrames {
			return errors.New("too many pending ZeroTier user messages")
		}
		n.pendingUserMessages[destination] = append(n.pendingUserMessages[destination], pendingUserMessage{typeID: typeID, data: append([]byte(nil), data...), createdAt: now})
		n.requestWhoisLocked(destination, now)
		return nil
	}
	return n.sendUserMessageLocked(peer, typeID, data)
}

// sendUserMessageLocked encodes and sends one VL1 application message.
func (n *Node) sendUserMessageLocked(peer *peer, typeID uint64, data []byte) error {
	packet, err := NewPacket(peer.identity.Address(), n.identity.Address(), VerbUserMessage)
	if err != nil {
		return err
	}
	_ = packet.AppendUint64(typeID)
	_ = packet.Append(data...)
	if err = packet.Compress(); err != nil {
		return err
	}
	return n.sendPacketLocked(peer, packet, true)
}

// pendingUserMessageCountLocked returns application messages awaiting peers.
func (n *Node) pendingUserMessageCountLocked() int {
	count := 0
	for _, messages := range n.pendingUserMessages {
		count += len(messages)
	}
	return count
}

// Network returns an independently owned snapshot of one joined network.
func (n *Node) Network(networkID uint64) (Network, bool) {
	n.mu.Lock()
	network, ok := n.networks[networkID]
	var result Network
	if ok {
		result = cloneNetwork(network)
	}
	n.mu.Unlock()
	return result, ok
}

// Networks returns snapshots of all joined networks.
func (n *Node) Networks() []Network {
	n.mu.Lock()
	networks := make([]Network, 0, len(n.networks))
	for _, network := range n.networks {
		networks = append(networks, cloneNetwork(network))
	}
	n.mu.Unlock()
	sort.Slice(networks, func(i, j int) bool { return networks[i].ID < networks[j].ID })
	return networks
}

// cloneNetwork returns a status snapshot without sharing mutable configuration.
func cloneNetwork(network *Network) Network {
	return Network{
		ID:                 network.ID,
		Status:             network.Status,
		Config:             cloneNetworkConfig(network.Config),
		LastConfigRequest:  network.LastConfigRequest,
		LastConfigReceive:  network.LastConfigReceive,
		Authentication:     network.Authentication,
		lastConfigUpdateID: network.lastConfigUpdateID,
		configUpdateSerial: network.configUpdateSerial,
	}
}

// SubscribeMulticast adds a local multicast group to network announcements.
func (n *Node) SubscribeMulticast(networkID uint64, group MulticastGroup) error {
	if !group.MAC.IsMulticast() {
		return ErrInvalidPacket
	}
	n.mu.Lock()
	defer n.unlockAndRunCallbacks()
	if n.closed {
		return ErrNodeClosed
	}
	network := n.networks[networkID]
	if network == nil {
		return ErrNetworkNotFound
	}
	if _, exists := network.multicastSubscriptions[group]; !exists && len(network.multicastSubscriptions) >= maxMulticastGroups {
		return errors.New("too many ZeroTier multicast subscriptions")
	}
	network.multicastSubscriptions[group] = struct{}{}
	network.multicastAnnouncements = make(map[Address]time.Time)
	if network.Status == NetworkStatusOK {
		n.announceMulticastLocked(network, time.Now())
	}
	return nil
}

// UnsubscribeMulticast removes a dynamically subscribed multicast group.
func (n *Node) UnsubscribeMulticast(networkID uint64, group MulticastGroup) error {
	n.mu.Lock()
	defer n.unlockAndRunCallbacks()
	if n.closed {
		return ErrNodeClosed
	}
	network := n.networks[networkID]
	if network == nil {
		return ErrNetworkNotFound
	}
	delete(network.multicastSubscriptions, group)
	network.multicastAnnouncements = make(map[Address]time.Time)
	return nil
}

// Peers returns independently owned diagnostic snapshots of known peers.
func (n *Node) Peers() []PeerStatus {
	n.mu.Lock()
	now := time.Now()
	peers := make([]PeerStatus, 0, len(n.peers))
	for address, peer := range n.peers {
		preferred := n.bestDirectPeerPathLocked(peer, now)
		major, minor, revision := -1, -1, -1
		if peer.major != 0 || peer.minor != 0 || peer.revision != 0 {
			major, minor, revision = int(peer.major), int(peer.minor), int(peer.revision)
		}
		status := PeerStatus{
			Address: address, Role: peer.role, Protocol: peer.protocol,
			VersionMajor: major, VersionMinor: minor, VersionRevision: revision,
			Paths: make([]PeerPath, 0, len(peer.paths)),
		}
		for key, path := range peer.paths {
			_, trustedPathID := n.outboundPathInfoLocked(key.endpoint)
			authenticatedAge := now.Sub(path.lastReceive)
			status.Paths = append(status.Paths, PeerPath{
				LocalSocket: key.localSocket, Endpoint: key.endpoint,
				LastSend: wirePathLastSend(path), LastReceive: wirePathLastReceive(path),
				Active:    authenticatedAge >= 0 && authenticatedAge < peerPathExpiration && pathScope(key.endpoint.Addr()) != 0,
				Preferred: key == preferred, Priority: path.priority, TrustedPathID: trustedPathID,
				Latency: path.latency, Jitter: path.jitter, PacketLoss: path.loss, PacketError: path.packetError,
			})
		}
		sort.Slice(status.Paths, func(i, j int) bool {
			if status.Paths[i].Preferred != status.Paths[j].Preferred {
				return status.Paths[i].Preferred
			}
			if status.Paths[i].Endpoint != status.Paths[j].Endpoint {
				return status.Paths[i].Endpoint.String() < status.Paths[j].Endpoint.String()
			}
			return status.Paths[i].LocalSocket < status.Paths[j].LocalSocket
		})
		peers = append(peers, status)
	}
	sort.Slice(peers, func(i, j int) bool { return peers[i].Address < peers[j].Address })
	n.mu.Unlock()
	return peers
}

// ProcessBackgroundTasks contacts roots, refreshes network configuration,
// maintains persistent state, and returns the next useful call time.
func (n *Node) ProcessBackgroundTasks(now time.Time) time.Time {
	n.mu.Lock()
	defer n.unlockAndRunCallbacks()
	if n.closed {
		return now.Add(PeerCacheCleanupInterval)
	}
	networkSpecialists := n.networkSpecialistAddressesLocked()
	contactPeriod := rootContactPeriod
	configRefreshPeriod := networkConfigRefreshPeriod
	if n.lowBandwidth {
		contactPeriod *= 5
		configRefreshPeriod *= 64
	}
	contactDue := n.lastRootContact.IsZero() || now.Sub(n.lastRootContact) >= contactPeriod
	if contactDue {
		n.lastRootContact = now
		for _, root := range n.allRootsLocked() {
			peer := n.peers[root.Identity.Address()]
			if peer == nil {
				continue
			}
			// ZeroTier's upstream role gate uses Peer::paths(), which includes
			// stale but unexpired paths, rather than Path::alive().
			if len(peer.paths) != 0 && !peer.lastFullHello.IsZero() && now.Sub(peer.lastFullHello) <= rootPathPingPeriod {
				continue
			}
			maxPriority := 1
			for _, path := range peer.paths {
				if path.priority > maxPriority {
					maxPriority = path.priority
				}
			}
			var sentV4, sentV6 bool
			for key, path := range peer.paths {
				if now.Sub(path.lastReceive) >= peerPathExpiration || path.priority > 0 && path.priority < maxPriority {
					n.deletePeerPathLocked(peer, key)
					continue
				}
				path.lastProbe = now
				if n.sendHelloAtPathLocked(peer.identity.Address(), key, now) != nil {
					continue
				}
				if key.endpoint.Addr().Is4() {
					sentV4 = true
				} else {
					sentV6 = true
				}
			}
			peer.lastFullHello = now
			for _, endpoint := range root.Endpoints {
				if endpoint.Addr().Is4() {
					if sentV4 {
						continue
					}
					sentV4 = true
				} else {
					if sentV6 {
						continue
					}
					sentV6 = true
				}
				_ = n.sendHelloLocked(root.Identity.Address(), endpoint, now)
			}
		}
		for _, seed := range n.moonSeeds {
			peer := n.peers[seed]
			if peer == nil {
				n.requestWhoisLocked(seed, now)
				continue
			}
			if path := n.bestPeerPathLocked(peer, now); path.endpoint.IsValid() {
				_ = n.sendHelloAtPathLocked(seed, path, now)
			}
		}
		for networkID, network := range n.networks {
			awaitingConfig := network.LastConfigReceive.Before(network.LastConfigRequest)
			if network.Status != NetworkStatusOK || network.LastConfigRequest.IsZero() ||
				(awaitingConfig && now.Sub(network.LastConfigRequest) >= networkConfigRetryPeriod) ||
				(!awaitingConfig && now.Sub(network.LastConfigRequest) >= configRefreshPeriod) {
				_ = n.requestNetworkConfigLocked(networkID, now)
			}
			if network.Status == NetworkStatusOK && !n.lowBandwidth {
				n.announceMulticastLocked(network, now)
			}
			if network.Config.NetworkID == network.ID {
				n.contactNetworkSpecialistsLocked(network, now)
			}
		}
	}
	for address, packets := range n.pendingIncoming {
		kept := packets[:0]
		for _, packet := range packets {
			if now.Sub(packet.receivedAt) > pendingIncomingExpiration {
				continue
			}
			if now.Sub(packet.lastTried) >= whoisRetryPeriod {
				packet.lastTried = now
				err := n.processWirePacketLocked(&packet, now, false)
				if err == nil || (!errors.Is(err, ErrUnknownPeer) && !errors.Is(err, errPacketRetry)) {
					continue
				}
			}
			kept = append(kept, packet)
		}
		if len(kept) == 0 {
			delete(n.pendingIncoming, address)
		} else {
			n.pendingIncoming[address] = kept
		}
	}
	for address, frames := range n.pendingFrames {
		kept := frames[:0]
		for _, frame := range frames {
			if now.Sub(frame.createdAt) <= pendingTransmitExpiration {
				kept = append(kept, frame)
			}
		}
		if len(kept) == 0 {
			delete(n.pendingFrames, address)
		} else {
			n.pendingFrames[address] = kept
		}
	}
	for address, messages := range n.pendingUserMessages {
		kept := messages[:0]
		for _, message := range messages {
			if now.Sub(message.createdAt) <= pendingTransmitExpiration {
				kept = append(kept, message)
			}
		}
		if len(kept) == 0 {
			delete(n.pendingUserMessages, address)
		} else {
			n.pendingUserMessages[address] = kept
		}
	}
	for address, traces := range n.pendingRemoteTraces {
		kept := traces[:0]
		for _, trace := range traces {
			if now.Sub(trace.createdAt) <= pendingTransmitExpiration {
				kept = append(kept, trace)
			}
		}
		if len(kept) == 0 {
			delete(n.pendingRemoteTraces, address)
		} else {
			n.pendingRemoteTraces[address] = kept
		}
	}
	for address, capabilities := range n.deferredCapabilities {
		kept := capabilities[:0]
		for _, capability := range capabilities {
			if now.Sub(capability.received) <= deferredCredentialExpiration {
				kept = append(kept, capability)
			}
		}
		if len(kept) == 0 {
			delete(n.deferredCapabilities, address)
		} else {
			n.deferredCapabilities[address] = kept
		}
	}
	for address, packets := range n.deferredCredentials {
		kept := packets[:0]
		for _, packet := range packets {
			if now.Sub(packet.received) <= deferredCredentialExpiration {
				kept = append(kept, packet)
			}
		}
		if len(kept) == 0 {
			delete(n.deferredCredentials, address)
		} else {
			n.deferredCredentials[address] = kept
		}
	}
	for key, surface := range n.surfaces {
		if now.Sub(surface.updated) >= 10*time.Minute {
			delete(n.surfaces, key)
		}
	}
	for _, network := range n.networks {
		network.cleanRemoteCredentials()
		for mac, route := range network.bridgeRoutes {
			if now.Sub(route.learned) >= bridgeRouteExpiration || !network.Config.isSpecialist(route.bridge, specialistTypeActiveBridge) {
				delete(network.bridgeRoutes, mac)
			}
		}
		for group, members := range network.multicast {
			for address, seen := range members {
				if now.Sub(seen) >= multicastMemberExpiration {
					delete(members, address)
				}
			}
			if len(members) == 0 {
				delete(network.multicast, group)
			}
		}
		for group, pending := range network.pendingMulticast {
			kept := pending[:0]
			for _, item := range pending {
				if now.Sub(item.createdAt) < multicastTransmitTimeout {
					kept = append(kept, item)
				}
			}
			if len(kept) == 0 {
				delete(network.pendingMulticast, group)
			} else {
				network.pendingMulticast[group] = kept
			}
		}
		for group := range network.lastMulticastGather {
			if len(network.multicast[group]) == 0 && len(network.pendingMulticast[group]) == 0 {
				delete(network.lastMulticastGather, group)
			}
		}
	}
	for packetID, request := range n.pending {
		if now.Sub(request.sentAt) > 30*time.Second {
			n.deletePendingLocked(packetID)
		}
	}
	n.retryPendingTransmitsLocked(Address(0), now)
	for address, requestedAt := range n.pendingWhois {
		if now.Sub(requestedAt) > 30*time.Second {
			delete(n.pendingWhois, address)
		}
	}
	n.retryPendingWhoisLocked(now)
	for _, peer := range n.peers {
		n.flushPendingPeerUserRouteLocked(peer, now)
		for key, last := range peer.lastEchoRequest {
			if now.Sub(last) >= peerGeneralRateLimit/6 {
				delete(peer.lastEchoRequest, key)
			}
		}
		if peer.root {
			for key, path := range peer.paths {
				if now.Sub(path.lastReceive) >= peerPathExpiration {
					n.deletePeerPathLocked(peer, key)
				}
			}
			n.sendQoSMeasurementsLocked(peer, now)
			continue
		}
		maxPriority := 1
		for _, path := range peer.paths {
			if path.priority > maxPriority {
				maxPriority = path.priority
			}
		}
		_, alwaysContact := networkSpecialists[peer.identity.Address()]
		active := !peer.lastNontrivialReceive.IsZero() && now.Sub(peer.lastNontrivialReceive) < learnedPeerExpiration
		runHeartbeat := !alwaysContact && active && (!n.lowBandwidth || contactDue)
		sendFullHello := false
		if runHeartbeat {
			sendFullHello = peer.lastFullHello.IsZero() || now.Sub(peer.lastFullHello) >= peerFullHelloPeriod
			if sendFullHello {
				peer.lastFullHello = now
			}
		}
		for key, path := range peer.paths {
			if now.Sub(path.lastReceive) >= peerPathExpiration {
				n.deletePeerPathLocked(peer, key)
				continue
			}
			if path.priority > 0 && path.priority < maxPriority {
				n.deletePeerPathLocked(peer, key)
				continue
			}
			if runHeartbeat && (sendFullHello || now.Sub(wirePathLastSend(path)) >= peerPathPingPeriod) {
				path.lastProbe = now
				if sendFullHello {
					_ = n.sendHelloAtPathLocked(peer.identity.Address(), key, now)
				} else {
					_ = n.sendPathProbeLocked(peer, key.localSocket, key.endpoint, now)
				}
			}
		}
		for key, probedAt := range peer.pathProbe {
			if now.Sub(probedAt) > peerPathProbeWindow {
				delete(peer.pathProbe, key)
			}
		}
		for flowID, flow := range peer.bondFlows {
			if now.Sub(flow.lastActive) >= peerPathExpiration {
				if state := peer.paths[flow.path]; state != nil && state.bondAssignedFlows > 0 {
					state.bondAssignedFlows--
				}
				delete(peer.bondFlows, flowID)
			}
		}
		policy := n.bondingPolicyForPeerLocked(peer)
		if policy != BondingNone {
			options := n.bondingOptionsForPeerLocked(peer)
			n.maintainBondLocked(peer, policy, options, now)
			monitorInterval := options.FailoverInterval / 3
			for key, path := range peer.paths {
				if !bondPathAllowed(key, options) {
					continue
				}
				interval := monitorInterval
				if !path.bondAlive {
					interval = options.FailoverInterval
				}
				if interval > 0 && wirePathAge(path, now) >= interval && (path.lastProbe.IsZero() || now.Sub(path.lastProbe) >= interval) {
					path.lastProbe = now
					_ = n.sendPathProbeLocked(peer, key.localSocket, key.endpoint, now)
				}
			}
			if policy == BondingActiveBackup {
				n.processBondNegotiationLocked(peer, options, now)
			}
		}
		n.sendQoSMeasurementsLocked(peer, now)
	}
	for address, peer := range n.peers {
		if !peer.root && (peer.lastReceive.IsZero() || now.Sub(peer.lastReceive) >= learnedPeerExpiration) {
			n.savePeerLocked(peer)
			n.removePeerLocked(address)
		}
	}
	n.maintainPeerCacheLocked(now)
	if n.online && now.Sub(n.lastRootReceive) >= rootOfflineTimeout {
		n.online = false
		n.emitLocked(Event{Type: EventNodeOffline})
	}
	next := n.lastRootContact.Add(contactPeriod)
	if !next.After(now) {
		next = now.Add(time.Millisecond)
	}
	if deadline, ok := n.peerCacheMaintenanceDeadlineLocked(); ok && deadline.Before(next) {
		next = deadline
	}
	for _, request := range n.pending {
		if deadline := request.sentAt.Add(30 * time.Second); deadline.Before(next) {
			next = deadline
		}
	}
	if len(n.pendingTransmits) != 0 {
		if deadline := now.Add(whoisRetryPeriod); deadline.Before(next) {
			next = deadline
		}
		if deadline := n.pendingTransmits[0].createdAt.Add(pendingTransmitExpiration); deadline.Before(next) {
			next = deadline
		}
	}
	n.fragmentMu.Lock()
	for packetID, assembly := range n.fragments {
		deadline := assembly.createdAt.Add(pendingIncomingExpiration)
		if deadline.Before(now) {
			n.removeFragmentAssemblyLocked(packetID, assembly)
		} else if deadline.Before(next) {
			next = deadline
		}
	}
	n.fragmentMu.Unlock()
	if n.hasPendingWhoisWorkLocked() {
		if deadline := now.Add(whoisRetryPeriod); deadline.Before(next) {
			next = deadline
		}
	}
	for _, capabilities := range n.deferredCapabilities {
		for _, capability := range capabilities {
			if deadline := capability.received.Add(deferredCredentialExpiration); deadline.Before(next) {
				next = deadline
			}
		}
	}
	for _, packets := range n.deferredCredentials {
		for _, packet := range packets {
			if deadline := packet.received.Add(deferredCredentialExpiration); deadline.Before(next) {
				next = deadline
			}
		}
	}
	for _, peer := range n.peers {
		if peer.pendingUserRoute != PeerRouteUnknown {
			deadline := peer.lastUserRouteReport.Add(peerRouteReportInterval)
			if deadline.Before(next) {
				next = deadline
			}
		}
		_, alwaysContact := networkSpecialists[peer.identity.Address()]
		active := !peer.lastNontrivialReceive.IsZero() && now.Sub(peer.lastNontrivialReceive) < learnedPeerExpiration
		for key, path := range peer.paths {
			if deadline := path.lastReceive.Add(peerPathExpiration); deadline.Before(next) {
				next = deadline
			}
			if len(path.qosIncoming) != 0 {
				deadline := path.lastQoSSent.Add(n.bondQoSIntervalLocked(peer))
				if path.lastQoSSent.IsZero() {
					deadline = now
				}
				if deadline.Before(next) {
					next = deadline
				}
			}
			if !peer.root && n.bondingPolicyForPeerLocked(peer) != BondingNone {
				options := n.bondingOptionsForPeerLocked(peer)
				if !bondPathAllowed(key, options) {
					continue
				}
				interval := options.FailoverInterval / 3
				if !path.bondAlive {
					interval = options.FailoverInterval
				}
				if deadline := path.lastProbe.Add(interval); deadline.Before(next) {
					next = deadline
				}
			}
			lastSend := wirePathLastSend(path)
			if active && !alwaysContact && !n.lowBandwidth && !peer.root && !lastSend.IsZero() {
				if deadline := lastSend.Add(peerPathPingPeriod); deadline.Before(next) {
					next = deadline
				}
			}
		}
	}
	return next
}

// networkSpecialistAddressesLocked returns specialists requiring periodic
// contact even without ordinary peer activity.
func (n *Node) networkSpecialistAddressesLocked() map[Address]struct{} {
	addresses := make(map[Address]struct{})
	for _, network := range n.networks {
		if network.Config.NetworkID != network.ID {
			continue
		}
		for _, address := range network.Config.specialistAddresses(specialistTypeNetworkRelay | specialistTypeMulticastReplicator) {
			addresses[address] = struct{}{}
		}
	}
	return addresses
}

// contactNetworkSpecialistsLocked discovers and maintains one network's
// configured specialists.
func (n *Node) contactNetworkSpecialistsLocked(network *Network, now time.Time) {
	for _, address := range network.Config.specialistAddresses(specialistTypeNetworkRelay | specialistTypeMulticastReplicator) {
		if address == n.identity.Address() {
			continue
		}
		peer := n.peers[address]
		if peer == nil {
			n.requestWhoisLocked(address, now)
			continue
		}
		maxPriority := 1
		for _, path := range peer.paths {
			if path.priority > maxPriority {
				maxPriority = path.priority
			}
		}
		paths := make([]pathKey, 0, len(peer.paths))
		for key, path := range peer.paths {
			if now.Sub(path.lastReceive) < peerPathExpiration && path.priority >= maxPriority {
				paths = append(paths, key)
			}
		}
		roleBasedTimerScale := 2
		if peer.root {
			roleBasedTimerScale = 16
		}
		if len(paths) != 0 && !peer.lastFullHello.IsZero() && now.Sub(peer.lastFullHello) <= time.Duration(roleBasedTimerScale)*peerPathPingPeriod {
			continue
		}
		sortBondPaths(paths)
		sendFullHello := peer.lastFullHello.IsZero() || now.Sub(peer.lastFullHello) >= peerFullHelloPeriod
		if sendFullHello {
			peer.lastFullHello = now
		}
		sent := false
		for _, key := range paths {
			path := peer.paths[key]
			if !sendFullHello && now.Sub(wirePathLastSend(path)) < peerPathPingPeriod {
				continue
			}
			path.lastProbe = now
			var err error
			if sendFullHello {
				err = n.sendHelloAtPathLocked(address, key, now)
			} else {
				err = n.sendPathProbeLocked(peer, key.localSocket, key.endpoint, now)
			}
			sent = sent || err == nil
		}
		if sent {
			continue
		}
		upstream := n.bestRootPathLocked(now)
		if upstream.endpoint.IsValid() {
			_ = n.sendHelloAtPathLocked(address, upstream, now)
		}
	}
}

// RunBackgroundTasks processes time-based node work until ctx is canceled.
// ProcessBackgroundTasks remains available for callers with their own event
// loop or clock.
func (n *Node) RunBackgroundTasks(ctx context.Context) {
	if ctx.Err() != nil {
		return
	}
	n.mu.Lock()
	done := n.done
	closed := n.closed
	n.mu.Unlock()
	if closed {
		return
	}
	next := n.ProcessBackgroundTasks(time.Now())
	delay := time.Until(next)
	if delay < time.Millisecond {
		delay = time.Millisecond
	}
	timer := time.NewTimer(delay)
	defer timer.Stop()
	for {
		select {
		case <-timer.C:
		case <-ctx.Done():
			return
		case <-done:
			return
		}
		next = n.ProcessBackgroundTasks(time.Now())
		delay = time.Until(next)
		if delay < time.Millisecond {
			delay = time.Millisecond
		}
		timer.Reset(delay)
	}
}

// ProcessWirePacket processes a packet received from the physical network.
// localSocket must remain stable for the lifetime of its local socket because
// the Node uses it to distinguish paths and returns it unchanged to WireSender.
// Use AnyLocalSocket for transports, such as a relay, that have no corresponding
// local physical socket.
func (n *Node) ProcessWirePacket(localSocket int64, remote netip.AddrPort, data []byte, now time.Time) error {
	assembled, complete, err := n.reassembleWirePacket(localSocket, remote, data, now)
	if errors.Is(err, ErrNodeClosed) || !complete && err == nil {
		return err
	}
	n.mu.Lock()
	defer n.unlockAndRunCallbacks()
	if n.closed {
		return ErrNodeClosed
	}
	if err != nil {
		n.traceInvalidPacketLocked(localSocket, remote, data, err.Error())
		return err
	}
	err = n.processWirePacketLocked(&assembled, now, true)
	if err != nil && !errors.Is(err, ErrUnknownPeer) && !errors.Is(err, errPacketRetry) {
		var traced *tracedPacketError
		if !errors.As(err, &traced) {
			n.traceInvalidPacketLocked(assembled.localSocket, assembled.remote, assembled.data, err.Error())
		}
	}
	if errors.Is(err, errPacketRetry) {
		return nil
	}
	return err
}

// processWirePacketLocked validates, authenticates, and dispatches one complete
// wire packet, optionally queuing traffic from unknown peers.
func (n *Node) processWirePacketLocked(input *receivedWirePacket, now time.Time, queueUnknown bool) error {
	localSocket, remote := input.localSocket, input.remote
	packet, err := parsePacketOwned(input.data)
	if err != nil {
		return err
	}
	if packet.Destination() != n.identity.Address() || packet.Source() == n.identity.Address() {
		return ErrInvalidPacket
	}
	if !input.authenticated && packet.Cipher() == CipherSuiteC25519Poly1305None && !packet.ExtendedArmor() && packet.Verb() == VerbHello {
		return n.handleHelloLocked(localSocket, remote, packet, now, false)
	}
	trustedPath := packet.Cipher() == CipherSuiteTrustedPath
	if !input.authenticated && trustedPath {
		if !n.inboundPathTrustedLocked(remote, packet.TrustedPathID()) {
			n.tracePacketAuthenticationFailureLocked(localSocket, remote, packet, "path not trusted")
			return &tracedPacketError{err: ErrInvalidPacket}
		}
		input.authenticated = true
	}
	peer := n.loadPeerCacheLocked(packet.Source(), now)
	if peer == nil {
		if queueUnknown && n.enqueuePendingIncomingLocked(packet.Source(), *input, now) {
			n.requestWhoisLocked(packet.Source(), now)
		}
		return ErrUnknownPeer
	}
	if !input.authenticated {
		if err := packet.dearmorWithIdentityAndAES(peer.key[:], &peer.aesKeys, n.identity); err != nil {
			if path := peer.paths[pathKey{localSocket: localSocket, endpoint: remote}]; path != nil && n.bondingPolicyForPeerLocked(peer) != BondingNone {
				path.packetError = path.packetError*0.984375 + 0.015625
			}
			n.tracePacketAuthenticationFailureLocked(localSocket, remote, packet, "invalid MAC")
			return &tracedPacketError{err: err}
		}
		input.authenticated = true
	}
	if err := packet.Uncompress(); err != nil {
		return err
	}
	input.data = packet.Bytes()
	var handlerErr error
	recordReceive := true
	switch packet.Verb() {
	case VerbHello:
		handlerErr = n.handleHelloLocked(localSocket, remote, packet, now, true)
	case VerbOK:
		payload := packet.Payload()
		recordReceive = false
		if len(payload) >= 9 {
			request, expected := n.pending[binary.BigEndian.Uint64(payload[1:9])]
			recordReceive = expected && request.verb == Verb(payload[0]) && (request.peer.IsZero() || request.peer == peer.identity.Address())
		}
		handlerErr = n.handleOKLocked(localSocket, remote, peer, packet, now)
	case VerbWhois:
		if !peer.lastWhoisRequest.IsZero() && now.Sub(peer.lastWhoisRequest) < peerWhoisRateLimit {
			return nil
		}
		peer.lastWhoisRequest = now
		handlerErr = n.handleWhoisLocked(localSocket, remote, peer, packet, now)
	case VerbEcho:
		path := pathKey{localSocket: localSocket, endpoint: remote}
		if last := peer.lastEchoRequest[path]; !last.IsZero() && now.Sub(last) < peerGeneralRateLimit/6 {
			return nil
		}
		if _, exists := peer.lastEchoRequest[path]; !exists && len(peer.lastEchoRequest) >= maxPeerPaths {
			var oldestKey pathKey
			var oldest time.Time
			for key, receivedAt := range peer.lastEchoRequest {
				if oldest.IsZero() || receivedAt.Before(oldest) {
					oldestKey, oldest = key, receivedAt
				}
			}
			delete(peer.lastEchoRequest, oldestKey)
		}
		peer.lastEchoRequest[path] = now
		handlerErr = n.handleEchoLocked(localSocket, remote, peer, packet)
	case VerbRendezvous:
		handlerErr = n.handleRendezvousLocked(localSocket, peer, packet, now)
	case VerbError:
		handlerErr = n.handleErrorLocked(peer, packet, now)
	case VerbFrame:
		handlerErr = n.handleFrameLocked(pathKey{localSocket: localSocket, endpoint: remote}, packet, now)
	case VerbExtFrame:
		handlerErr = n.handleExtFrameLocked(pathKey{localSocket: localSocket, endpoint: remote}, packet, now)
	case VerbNetworkCredentials:
		if !peer.lastCredentialsReceive.IsZero() && now.Sub(peer.lastCredentialsReceive) < peerCredentialsRateLimit {
			return nil
		}
		peer.lastCredentialsReceive = now
		handlerErr = n.handleNetworkCredentialsLocked(peer, packet, now)
	case VerbNetworkConfigRequest:
		handlerErr = n.handleUnsupportedNetworkConfigRequestLocked(peer, pathKey{localSocket: localSocket, endpoint: remote}, packet)
	case VerbNetworkConfig:
		handlerErr = n.handleNetworkConfigPushLocked(localSocket, remote, peer, packet, now)
	case VerbMulticastLike:
		handlerErr = n.handleMulticastLikeLocked(peer, packet, now)
	case VerbMulticastGather:
		handlerErr = n.handleMulticastGatherLocked(pathKey{localSocket: localSocket, endpoint: remote}, peer, packet, now)
	case VerbMulticastFrame:
		handlerErr = n.handleMulticastFrameLocked(pathKey{localSocket: localSocket, endpoint: remote}, peer, packet, now)
	case VerbPushDirectPaths:
		if now.Sub(peer.lastDirectPathPush) <= pushDirectPathsCutoffTime {
			peer.directPathPushCount++
		} else {
			peer.directPathPushCount = 0
		}
		peer.lastDirectPathPush = now
		if peer.directPathPushCount >= pushDirectPathsCutoffLimit {
			break
		}
		handlerErr = n.handlePushDirectPathsLocked(localSocket, remote, peer, packet, now)
	case VerbUserMessage:
		payload := packet.Payload()
		if len(payload) < 8 {
			break
		}
		if callback := n.onUserMessage; callback != nil {
			message := UserMessage{Origin: peer.identity.Address(), TypeID: binary.BigEndian.Uint64(payload), Data: append([]byte(nil), payload[8:]...)}
			n.queueDataCallbackLocked(dataCallback{kind: dataCallbackUserMessage, callback: callback, origin: uint64(message.Origin), id: message.TypeID, payload: message.Data})
		}
	case VerbRemoteTrace:
		if callback := n.onRemoteTrace; callback != nil {
			payload := packet.Payload()
			for start := 0; start < len(payload); {
				end := start
				for end < len(payload) && payload[end] != 0 {
					end++
				}
				if end == len(payload) {
					break
				}
				if end > start && end-start <= maxRemoteTraceSize {
					trace := RemoteTrace{Origin: peer.identity.Address(), Data: string(payload[start:end])}
					n.queueDataCallbackLocked(dataCallback{kind: dataCallbackRemoteTrace, callback: callback, origin: uint64(trace.Origin), text: trace.Data})
				}
				start = end + 1
			}
		}
	case VerbACK:
		recordReceive = false
	case VerbQoSMeasurement:
		recordReceive = false
		handlerErr = n.handleQoSMeasurementLocked(peer, pathKey{localSocket: localSocket, endpoint: remote}, packet, now)
	case VerbPathNegotiation:
		recordReceive = false
		handlerErr = n.handlePathNegotiationLocked(peer, pathKey{localSocket: localSocket, endpoint: remote}, packet, now)
	default:
	}
	if errors.Is(handlerErr, errPacketRetry) {
		if queueUnknown {
			n.enqueuePendingIncomingLocked(peer.identity.Address(), *input, now)
		}
		return errPacketRetry
	}
	if errors.Is(handlerErr, errPacketNotAccepted) {
		return nil
	}
	var authenticatedErr *authenticatedPacketError
	if handlerErr != nil && !errors.As(handlerErr, &authenticatedErr) {
		return handlerErr
	}
	if recordReceive {
		n.recordIncomingBondPacketLocked(peer, pathKey{localSocket: localSocket, endpoint: remote}, packet, packetFlowID(packet), now)
		if packet.Hops() == 0 && packet.Verb() != VerbOK {
			n.observeAuthenticatedPacketPathLocked(peer, localSocket, remote, packet.Verb(), packet.PacketID(), packetNetworkID(packet), now)
		}
		peer.lastReceive = now
		switch packet.Verb() {
		case VerbFrame, VerbExtFrame, VerbNetworkConfigRequest, VerbNetworkConfig, VerbMulticastFrame:
			peer.lastNontrivialReceive = now
		}
		n.markRootReceiveLocked(peer, remote, now)
	}
	if authenticatedErr != nil {
		return authenticatedErr.cause
	}
	return nil
}

// authenticatedPacketError marks a packet whose outer armor and peer identity
// were valid but whose verb-specific content was not usable. The official core
// still accounts such packets as peer traffic, unlike structurally truncated or
// unauthenticated packets.
type authenticatedPacketError struct {
	cause error
}

// Error returns the unusable authenticated packet's error message.
func (e *authenticatedPacketError) Error() string { return e.cause.Error() }

// Unwrap exposes the verb-specific authenticated packet error.
func (e *authenticatedPacketError) Unwrap() error { return e.cause }

// authenticatedContentError marks an error already reported by remote trace.
func authenticatedContentError(err error) error {
	if err == nil {
		return nil
	}
	return &authenticatedPacketError{cause: err}
}

// handleUnsupportedNetworkConfigRequestLocked returns the protocol error for a
// request this node cannot serve.
func (n *Node) handleUnsupportedNetworkConfigRequestLocked(peer *peer, path pathKey, packet *Packet) error {
	payload := packet.Payload()
	if len(payload) < 8 {
		return ErrInvalidPacket
	}
	reply, err := NewPacket(peer.identity.Address(), n.identity.Address(), VerbError)
	if err != nil {
		return err
	}
	_ = reply.Append(byte(VerbNetworkConfigRequest))
	_ = reply.AppendUint64(packet.PacketID())
	_ = reply.Append(0x05) // ERROR_UNSUPPORTED_OPERATION
	_ = reply.Append(payload[:8]...)
	_ = n.sendPacketViaPathLocked(peer, reply, true, path, false)
	return nil
}

// peerRoleLocked returns the trust role assigned by the active planet and
// moons.
func (n *Node) peerRoleLocked(address Address) PeerRole {
	if worldHasRoot(n.planet, address) {
		return PeerRolePlanet
	}
	for _, moon := range n.moons {
		if worldHasRoot(moon, address) {
			return PeerRoleMoon
		}
	}
	return PeerRoleLeaf
}

// addPeerLocked validates and installs a peer identity under capacity policy.
func (n *Node) addPeerLocked(identity Identity, root bool) error {
	if identity.Address() == n.identity.Address() {
		return nil
	}
	if existing := n.peers[identity.Address()]; existing != nil {
		if existing.identity.PublicString() != identity.PublicString() {
			return ErrIdentityCollision
		}
		if root {
			existing.root = true
			existing.role = n.peerRoleLocked(identity.Address())
			if existing.role == PeerRoleLeaf {
				existing.role = PeerRolePlanet
			}
		}
		return nil
	}
	peer, err := n.newPeerLocked(identity, root)
	if err != nil {
		return err
	}
	n.peers[identity.Address()] = peer
	n.peerAddedLocked(peer, time.Now())
	return nil
}

// newPeerLocked constructs an unpublished peer and applies learned-peer
// capacity policy. The caller may finish restoring state before publishing it.
func (n *Node) newPeerLocked(identity Identity, root bool) (*peer, error) {
	key, err := n.identity.Agree(identity)
	if err != nil {
		return nil, err
	}
	aesKeys, err := ztcrypto.NewGMACSIVKeys(key[:])
	if err != nil {
		return nil, err
	}
	if !root && n.learnedPeerCountLocked() >= maxLearnedPeers {
		if !n.evictOldestLearnedPeerLocked() {
			return nil, errors.New("too many learned ZeroTier peers")
		}
	}
	role := PeerRoleLeaf
	if root {
		role = n.peerRoleLocked(identity.Address())
		if role == PeerRoleLeaf {
			role = PeerRolePlanet
		}
	}
	return &peer{
		identity:        identity,
		publicKeyHash:   identity.publicKeyHash(),
		key:             key,
		aesKeys:         aesKeys,
		root:            root,
		role:            role,
		paths:           make(map[pathKey]*peerPathState),
		credentialsSent: make(map[uint64]time.Time),
		pathProbe:       make(map[pathKey]time.Time),
		lastEchoRequest: make(map[pathKey]time.Time),
		bondFlows:       make(map[int32]bondFlow),
	}, nil
}

// peerAddedLocked releases work that was waiting for a newly published peer.
func (n *Node) peerAddedLocked(peer *peer, now time.Time) {
	address := peer.identity.Address()
	delete(n.pendingWhois, address)
	n.retryDeferredCapabilitiesLocked(address)
	n.retryDeferredCredentialsLocked(address)
	n.retryCompletedConfigAssembliesLocked(now)
	n.emitLocked(Event{Type: EventPeerIdentityLearned, PeerAddress: address, PeerRole: peer.role})
	n.flushPeerQueuesLocked(address, now)
}

// learnedPeerCountLocked returns the number of active non-root peers.
func (n *Node) learnedPeerCountLocked() int {
	count := 0
	for _, peer := range n.peers {
		if !peer.root {
			count++
		}
	}
	return count
}

// evictOldestLearnedPeerLocked persists and removes the stalest learned peer.
func (n *Node) evictOldestLearnedPeerLocked() bool {
	var oldestAddress Address
	var oldest time.Time
	for address, peer := range n.peers {
		if peer.root {
			continue
		}
		if oldestAddress.IsZero() || peer.lastReceive.Before(oldest) {
			oldestAddress, oldest = address, peer.lastReceive
		}
	}
	if oldestAddress.IsZero() {
		return false
	}
	n.savePeerLocked(n.peers[oldestAddress])
	n.removePeerLocked(oldestAddress)
	return true
}

// removePeerLocked removes a peer and its associated network state.
func (n *Node) removePeerLocked(address Address) {
	peer := n.peers[address]
	if peer != nil {
		for key := range peer.paths {
			n.deletePeerPathLocked(peer, key)
		}
	}
	delete(n.peers, address)
	for _, network := range n.networks {
		delete(network.members, address)
		delete(network.ownership, address)
		delete(network.tags, address)
		delete(network.capabilities, address)
		delete(network.revocations, address)
		delete(network.associated, address)
		delete(network.multicastAnnouncements, address)
		for group, members := range network.multicast {
			delete(members, address)
			if len(members) == 0 {
				delete(network.multicast, group)
			}
		}
		for mac, route := range network.bridgeRoutes {
			if route.bridge == address {
				delete(network.bridgeRoutes, mac)
			}
		}
	}
}

// sendHelloLocked sends a full handshake using an endpoint and selected socket.
func (n *Node) sendHelloLocked(address Address, endpoint netip.AddrPort, now time.Time) error {
	return n.sendHelloAtPathLocked(address, pathKey{localSocket: AnyLocalSocket, endpoint: endpoint}, now)
}

// sendHelloAtPathLocked sends a full handshake on one explicit path.
func (n *Node) sendHelloAtPathLocked(address Address, path pathKey, now time.Time) error {
	return n.sendHelloAtPathWithPriorityLocked(address, path, now, 0)
}

// sendHelloAtPathWithPriorityLocked sends a handshake with path priority.
func (n *Node) sendHelloAtPathWithPriorityLocked(address Address, path pathKey, now time.Time, priority int) error {
	return n.sendHelloAtPathWithPriorityAndNetworkLocked(address, path, now, priority, 0)
}

// sendHelloAtPathWithPriorityAndNetworkLocked sends a handshake carrying path
// priority and optional network context.
func (n *Node) sendHelloAtPathWithPriorityAndNetworkLocked(address Address, path pathKey, now time.Time, priority int, networkID uint64) error {
	peer := n.loadPeerCacheLocked(address, now)
	if peer == nil {
		return ErrUnknownPeer
	}
	packet, err := NewPacket(address, n.identity.Address(), VerbHello)
	if err != nil {
		return err
	}
	_ = packet.Append(ProtocolVersion, nodeVersionMajor, nodeVersionMinor)
	_ = packet.AppendUint16(nodeVersionRev)
	_ = packet.AppendUint64(uint64(now.UnixMilli()))
	_ = packet.Append(n.identity.AppendBinary(nil, false)...)
	_ = packet.Append(appendInetAddress(nil, path.endpoint)...)
	_ = packet.AppendUint64(n.planet.ID)
	_ = packet.AppendUint64(n.planet.Timestamp)
	cryptedAt := len(packet.Bytes())
	moonIDs := make([]uint64, 0, len(n.moons)+len(n.moonSeeds))
	for id := range n.moons {
		moonIDs = append(moonIDs, id)
	}
	for id := range n.moonSeeds {
		if _, ok := n.moons[id]; !ok {
			moonIDs = append(moonIDs, id)
		}
	}
	sort.Slice(moonIDs, func(i, j int) bool { return moonIDs[i] < moonIDs[j] })
	_ = packet.AppendUint16(uint16(len(moonIDs)))
	for _, id := range moonIDs {
		_ = packet.Append(byte(WorldTypeMoon))
		_ = packet.AppendUint64(id)
		_ = packet.AppendUint64(n.moons[id].Timestamp)
	}
	if err := packet.CryptField(peer.key[:], cryptedAt, len(packet.Bytes())-cryptedAt); err != nil {
		return err
	}
	sendPath := path
	if !n.lowBandwidth {
		// The official core lets the embedding choose the local socket for a
		// full HELLO unless low-bandwidth mode requests strict path affinity.
		sendPath.localSocket = AnyLocalSocket
	}
	if err := n.addPendingLocked(packet.PacketID(), pendingRequest{verb: VerbHello, peer: address, networkID: networkID, sentAt: now, path: sendPath, priority: priority}); err != nil {
		return err
	}
	if err := n.sendPacketViaPathLocked(peer, packet, false, sendPath, n.encryptedHello); err != nil {
		n.deletePendingLocked(packet.PacketID())
		return err
	}
	if sendPath != path {
		n.noteWirePathSendLocked(path, now)
		if state := peer.paths[path]; state != nil {
			state.lastSend = now
		}
	}
	return nil
}

// handleHelloLocked validates a peer handshake and replies with negotiated
// version and path data.
func (n *Node) handleHelloLocked(localSocket int64, remote netip.AddrPort, packet *Packet, now time.Time, alreadyAuthenticated bool) error {
	const identityOffset = PacketPayloadOffset + 1 + 1 + 1 + 2 + 8
	if len(packet.Bytes()) < identityOffset+serializedIdentitySize {
		return ErrInvalidPacket
	}
	if packet.Bytes()[PacketPayloadOffset] < ProtocolVersionMin {
		n.traceDroppedHelloLocked(localSocket, remote, packet, "protocol version too old")
		return &tracedPacketError{err: ErrInvalidPacket}
	}
	identity, identityLength, err := ParseIdentityBinary(packet.Bytes()[identityOffset:])
	if err != nil {
		return err
	}
	if identity.Address() != packet.Source() {
		n.traceDroppedHelloLocked(localSocket, remote, packet, "identity/address mismatch")
		return &tracedPacketError{err: ErrInvalidIdentity}
	}
	existing := n.loadPeerCacheLocked(identity.Address(), now)
	var knownPeer *peer
	newPeer := false
	if existing != nil {
		if existing.identity.PublicKey() != identity.PublicKey() {
			if alreadyAuthenticated {
				knownPeer = existing
			} else {
				if !n.allowIdentityValidationLocked(remote.Addr(), now) {
					return nil
				}
				key, agreeErr := n.identity.Agree(identity)
				if agreeErr != nil {
					n.tracePacketAuthenticationFailureLocked(localSocket, remote, packet, "invalid identity")
					return &tracedPacketError{err: agreeErr}
				}
				if err := packet.Dearmor(key[:]); err != nil {
					n.tracePacketAuthenticationFailureLocked(localSocket, remote, packet, "invalid MAC")
					return &tracedPacketError{err: err}
				}
				n.traceDroppedHelloLocked(localSocket, remote, packet, "address collision")
				reply, replyErr := NewPacket(identity.Address(), n.identity.Address(), VerbError)
				if replyErr == nil {
					_ = reply.Append(byte(VerbHello))
					_ = reply.AppendUint64(packet.PacketID())
					_ = reply.Append(0x04)
					temporaryPeer := &peer{identity: identity, key: key}
					_ = n.sendPacketViaPathLocked(temporaryPeer, reply, true, pathKey{localSocket: localSocket, endpoint: remote}, false)
				}
				return &tracedPacketError{err: ErrIdentityCollision}
			}
		} else {
			knownPeer = existing
			if !alreadyAuthenticated {
				if err := packet.Dearmor(knownPeer.key[:]); err != nil {
					n.tracePacketAuthenticationFailureLocked(localSocket, remote, packet, "invalid MAC")
					return &tracedPacketError{err: err}
				}
			}
		}
	} else {
		if alreadyAuthenticated {
			n.traceDroppedHelloLocked(localSocket, remote, packet, "illegal alreadyAuthenticated state")
			return &tracedPacketError{err: ErrInvalidPacket}
		}
		if !n.allowIdentityValidationLocked(remote.Addr(), now) {
			n.traceDroppedHelloLocked(localSocket, remote, packet, "rate limit exceeded")
			return nil
		}
		key, agreeErr := n.identity.Agree(identity)
		if agreeErr != nil {
			n.tracePacketAuthenticationFailureLocked(localSocket, remote, packet, "invalid identity")
			return &tracedPacketError{err: agreeErr}
		}
		if err := packet.Dearmor(key[:]); err != nil {
			n.tracePacketAuthenticationFailureLocked(localSocket, remote, packet, "invalid MAC")
			return &tracedPacketError{err: err}
		}
		if err := identity.Validate(); err != nil {
			n.traceDroppedHelloLocked(localSocket, remote, packet, "invalid identity")
			return &tracedPacketError{err: err}
		}
		knownPeer, err = n.newPeerLocked(identity, n.isRootAddressLocked(identity.Address()))
		if err != nil {
			return err
		}
		newPeer = true
	}
	peer := knownPeer
	payload := packet.Bytes()

	pos := identityOffset + identityLength
	var externalSurface netip.AddrPort
	if pos < len(payload) {
		parsedSurface, addressLength, parseErr := parseInetAddress(payload[pos:])
		if parseErr != nil {
			return ErrInvalidPacket
		}
		externalSurface = parsedSurface
		pos += addressLength
	}
	var remotePlanetID, remotePlanetTimestamp uint64
	if len(payload)-pos >= 16 {
		remotePlanetID = binary.BigEndian.Uint64(payload[pos:])
		remotePlanetTimestamp = binary.BigEndian.Uint64(payload[pos+8:])
		pos += 16
	}
	remoteMoons := make(map[uint64]uint64)
	if pos < len(payload) {
		if err := packet.CryptField(peer.key[:], pos, len(payload)-pos); err != nil {
			return err
		}
		if len(payload)-pos < 2 {
			return ErrInvalidPacket
		}
		count := int(binary.BigEndian.Uint16(payload[pos:]))
		pos += 2
		if count > (len(payload)-pos)/17 {
			return ErrInvalidPacket
		}
		for i := 0; i < count; i++ {
			worldType := WorldType(payload[pos])
			worldID := binary.BigEndian.Uint64(payload[pos+1:])
			worldTimestamp := binary.BigEndian.Uint64(payload[pos+9:])
			pos += 17
			if worldType == WorldTypeMoon {
				remoteMoons[worldID] = worldTimestamp
			}
		}
	}

	timestamp := binary.BigEndian.Uint64(payload[PacketPayloadOffset+5:])
	reply, err := NewPacket(identity.Address(), n.identity.Address(), VerbOK)
	if err != nil {
		return err
	}
	_ = reply.Append(byte(VerbHello))
	_ = reply.AppendUint64(packet.PacketID())
	_ = reply.AppendUint64(timestamp)
	_ = reply.Append(ProtocolVersion, nodeVersionMajor, nodeVersionMinor)
	_ = reply.AppendUint16(nodeVersionRev)
	_ = reply.Append(appendInetAddress(nil, remote)...)
	worlds := make([]byte, 0)
	if remotePlanetID == n.planet.ID && remotePlanetTimestamp < n.planet.Timestamp {
		worlds, err = n.planet.AppendTo(worlds, false)
		if err != nil {
			return err
		}
	}
	for worldID, remoteTimestamp := range remoteMoons {
		if moon, ok := n.moons[worldID]; ok && remoteTimestamp < moon.Timestamp {
			worlds, err = moon.AppendTo(worlds, false)
			if err != nil {
				return err
			}
		}
	}
	if len(worlds) > int(^uint16(0)) {
		return ErrInvalidPacket
	}
	_ = reply.AppendUint16(uint16(len(worlds)))
	_ = reply.Append(worlds...)
	if newPeer {
		// Do not expose the peer to queued protocol work until HELLO has been
		// fully parsed. peerAddedLocked is deliberately deferred until version
		// and path state below have also been committed.
		n.peers[identity.Address()] = peer
	}
	if packet.Hops() == 0 && externalSurface.IsValid() {
		n.observeSurfaceLocked(peer, localSocket, remote, externalSurface, now)
	}
	_ = n.sendPacketViaPathLocked(peer, reply, true, pathKey{localSocket: localSocket, endpoint: remote}, false)
	peer.protocol = payload[PacketPayloadOffset]
	peer.major = payload[PacketPayloadOffset+1]
	peer.minor = payload[PacketPayloadOffset+2]
	peer.revision = binary.BigEndian.Uint16(payload[PacketPayloadOffset+3:])
	if !alreadyAuthenticated {
		n.recordIncomingBondPacketLocked(peer, pathKey{localSocket: localSocket, endpoint: remote}, packet, noFlowID, now)
	}
	peer.lastReceive = now
	n.markRootReceiveLocked(peer, remote, now)
	if !alreadyAuthenticated && packet.Hops() == 0 {
		n.observeAuthenticatedPathLocked(peer, localSocket, remote, VerbHello, now)
	}
	if newPeer {
		n.peerAddedLocked(peer, now)
	}
	return nil
}

// handleOKLocked dispatches a response according to the acknowledged verb.
func (n *Node) handleOKLocked(localSocket int64, remote netip.AddrPort, peer *peer, packet *Packet, now time.Time) error {
	payload := packet.Payload()
	if len(payload) < 9 {
		return ErrInvalidPacket
	}
	inReplyTo := Verb(payload[0])
	inReplyToPacket := binary.BigEndian.Uint64(payload[1:9])
	pending, expected := n.pending[inReplyToPacket]
	if !expected || pending.verb != inReplyTo || (!pending.peer.IsZero() && pending.peer != peer.identity.Address()) {
		return nil
	}
	// A HELLO sent through AnyLocalSocket may leave through multiple physical
	// sockets with the same packet ID. Retain it for the normal short pending
	// window so every authenticated response can establish its distinct path.
	consumePending := inReplyTo != VerbNetworkConfigRequest && inReplyTo != VerbHello
	var handlerErr error
	switch inReplyTo {
	case VerbHello:
		if len(payload) < 22 || payload[17] < ProtocolVersionMin {
			return ErrInvalidPacket
		}
		protocol := payload[17]
		major := payload[18]
		minor := payload[19]
		revision := binary.BigEndian.Uint16(payload[20:22])
		pos := 22
		var externalSurface netip.AddrPort
		if pos < len(payload) {
			parsedSurface, addressLength, parseErr := parseInetAddress(payload[pos:])
			if parseErr != nil {
				return ErrInvalidPacket
			}
			externalSurface = parsedSurface
			pos += addressLength
		}
		if len(payload)-pos >= 2 {
			worldsLength := int(binary.BigEndian.Uint16(payload[pos:]))
			pos += 2
			if worldsLength > len(payload)-pos {
				return ErrInvalidPacket
			}
			if n.shouldAcceptWorldUpdateFromLocked(peer.identity.Address()) {
				end := pos + worldsLength
				for pos < end {
					world, consumed, err := ParseWorld(payload[pos:end])
					if err != nil || consumed <= 0 {
						return ErrInvalidWorld
					}
					if err := n.addWorldLocked(world, false); err != nil && !errors.Is(err, ErrInvalidWorld) {
						return err
					}
					pos += consumed
				}
			}
		}
		peer.protocol = protocol
		peer.major = major
		peer.minor = minor
		peer.revision = revision
		if packet.Hops() == 0 && externalSurface.IsValid() {
			n.observeSurfaceLocked(peer, localSocket, remote, externalSurface, now)
		}
	case VerbEcho:
	case VerbWhois:
		if !peer.root {
			break
		}
		for pos := 9; pos < len(payload); {
			identity, consumed, err := ParseIdentityBinary(payload[pos:])
			if err != nil {
				return err
			}
			if err := identity.Validate(); err != nil {
				return err
			}
			if err := n.addPeerLocked(identity, n.isRootAddressLocked(identity.Address())); err != nil {
				return err
			}
			pos += consumed
		}
		for networkID, network := range n.networks {
			if n.peers[Controller(networkID)] != nil && (network.Status == NetworkStatusRequestingConfiguration || network.LastConfigRequest.IsZero()) {
				_ = n.sendNetworkConfigRequestLocked(networkID, now)
			}
		}
	case VerbNetworkConfigRequest:
		// Network configuration chunk parsing is handled by network_config.go.
		var previousSerial uint64
		if len(payload) >= 17 {
			if network := n.networks[binary.BigEndian.Uint64(payload[9:17])]; network != nil {
				previousSerial = network.configUpdateSerial
			}
		}
		handlerErr = n.handleNetworkConfigChunkLocked(packet, 9, now)
		if handlerErr == nil && len(payload) >= 17 {
			if network := n.networks[binary.BigEndian.Uint64(payload[9:17])]; network != nil && network.configUpdateSerial != previousSerial {
				consumePending = true
			}
		}
	case VerbMulticastGather:
		handlerErr = n.handleMulticastGatherOKLocked(payload, now)
	case VerbMulticastFrame:
		handlerErr = n.handleMulticastFrameOKLocked(peer, payload, now)
	case VerbExtFrame:
		if len(payload) < 17 || binary.BigEndian.Uint64(payload[9:17]) != pending.networkID {
			return ErrInvalidPacket
		}
	}
	var authenticatedErr *authenticatedPacketError
	if handlerErr != nil && !errors.As(handlerErr, &authenticatedErr) {
		return handlerErr
	}
	if consumePending {
		n.consumePendingReplyLocked(inReplyToPacket, pending, pathKey{localSocket: localSocket, endpoint: remote})
	}
	if packet.Hops() == 0 {
		n.observeAuthenticatedPacketPathLocked(peer, localSocket, remote, VerbOK, packet.PacketID(), pending.networkID, now)
		key := pathKey{localSocket: localSocket, endpoint: remote}
		if path := peer.paths[key]; path != nil && pending.priority > path.priority {
			path.priority = pending.priority
			if pending.priority > 1 {
				n.pruneLowerPriorityPathsLocked(peer, key, pending.priority)
			}
		}
	}
	if inReplyTo == VerbHello {
		if packet.Hops() == 0 {
			n.updatePathLatencyLocked(peer, localSocket, remote, binary.BigEndian.Uint64(payload[9:17]), now)
		}
		n.markRootReceiveLocked(peer, remote, now)
	}
	if authenticatedErr != nil {
		return authenticatedErr
	}
	return nil
}

// pruneLowerPriorityPathsLocked removes paths superseded by keep.
func (n *Node) pruneLowerPriorityPathsLocked(peer *peer, keep pathKey, priority int) {
	for key, path := range peer.paths {
		if key == keep {
			continue
		}
		if path.priority < priority || sameClusterPathIP(key.endpoint.Addr(), keep.endpoint.Addr()) {
			n.deletePeerPathLocked(peer, key)
		}
	}
}

// peerHasActiveEndpoint reports whether endpoint remains an authenticated peer
// path. ZeroTier One uses _PeerPath.lr and the full path-expiration window here,
// not the shorter physical Path::alive interval.
func peerHasActiveEndpoint(peer *peer, endpoint netip.AddrPort, now time.Time) bool {
	for key, path := range peer.paths {
		if key.endpoint == endpoint && now.Sub(path.lastReceive) < peerPathExpiration {
			return true
		}
	}
	return false
}

// sameClusterPathIP reports whether addresses are equivalent for cluster path
// suppression.
func sameClusterPathIP(left, right netip.Addr) bool {
	left, right = left.Unmap(), right.Unmap()
	if left.Is4() || right.Is4() {
		return left == right
	}
	if !left.Is6() || !right.Is6() {
		return false
	}
	leftBytes, rightBytes := left.As16(), right.As16()
	return binary.BigEndian.Uint64(leftBytes[:8]) == binary.BigEndian.Uint64(rightBytes[:8])
}

// handleWhoisLocked answers identity requests when the requested peer is known.
func (n *Node) handleWhoisLocked(localSocket int64, remote netip.AddrPort, requestingPeer *peer, packet *Packet, now time.Time) error {
	reply, err := NewPacket(requestingPeer.identity.Address(), n.identity.Address(), VerbOK)
	if err != nil {
		return err
	}
	_ = reply.Append(byte(VerbWhois))
	_ = reply.AppendUint64(packet.PacketID())
	count := 0
	for pos := PacketPayloadOffset; pos+AddressSize <= len(packet.Bytes()); pos += AddressSize {
		address, _ := AddressFromBytes(packet.Bytes()[pos : pos+AddressSize])
		if address == n.identity.Address() {
			_ = reply.Append(n.identity.AppendBinary(nil, false)...)
			count++
		} else if known := n.peers[address]; known != nil {
			_ = reply.Append(known.identity.AppendBinary(nil, false)...)
			count++
		} else {
			n.requestWhoisLocked(address, now)
		}
	}
	if count == 0 {
		return nil
	}
	_ = n.sendPacketViaPathLocked(requestingPeer, reply, true, pathKey{localSocket: localSocket, endpoint: remote}, false)
	return nil
}

// handleEchoLocked replies to a path liveness probe.
func (n *Node) handleEchoLocked(localSocket int64, remote netip.AddrPort, peer *peer, packet *Packet) error {
	reply, err := NewPacket(peer.identity.Address(), n.identity.Address(), VerbOK)
	if err != nil {
		return err
	}
	_ = reply.Append(byte(VerbEcho))
	_ = reply.AppendUint64(packet.PacketID())
	_ = reply.Append(packet.Payload()...)
	_ = n.sendPacketViaPathLocked(peer, reply, true, pathKey{localSocket: localSocket, endpoint: remote}, false)
	return nil
}

// handleRendezvousLocked validates candidate endpoint advice and probes it.
func (n *Node) handleRendezvousLocked(localSocket int64, source *peer, packet *Packet, now time.Time) error {
	payload := packet.Payload()
	if !source.root {
		return nil
	}
	if len(payload) < 9 {
		return ErrInvalidPacket
	}
	address, err := AddressFromBytes(payload[1:6])
	if err != nil {
		return err
	}
	port := binary.BigEndian.Uint16(payload[6:8])
	length := int(payload[8])
	if port == 0 || (length != 4 && length != 16) {
		return nil
	}
	if len(payload) < 9+length {
		return ErrInvalidPacket
	}
	var ip netip.Addr
	if length == 4 {
		var raw [4]byte
		copy(raw[:], payload[9:13])
		ip = netip.AddrFrom4(raw)
	} else {
		var raw [16]byte
		copy(raw[:], payload[9:25])
		ip = netip.AddrFrom16(raw)
	}
	peer := n.loadPeerCacheLocked(address, now)
	if peer == nil {
		n.requestWhoisLocked(address, now)
		return nil
	}
	endpoint := netip.AddrPortFrom(ip, port)
	if !n.pathAllowedLocked(peer, endpoint, localSocket) {
		return nil
	}
	var junk [4]byte
	_, _ = rand.Read(junk[:])
	// Sending from the same local socket is what opens NAT and stateful-firewall
	// state; the packet's IP TTL does not affect that. The native implementation
	// limits these four random bytes to two hops, but doing so here would require
	// changing socket-wide state and could affect concurrent protocol packets.
	_ = n.sender.Send(localSocket, endpoint, junk[:])
	_ = n.sendPathProbeLocked(peer, localSocket, endpoint, now)
	return nil
}

// handlePushDirectPathsLocked validates and probes authenticated peer path
// advertisements.
func (n *Node) handlePushDirectPathsLocked(localSocket int64, remote netip.AddrPort, peer *peer, packet *Packet, now time.Time) error {
	payload := packet.Payload()
	if len(payload) < 2 {
		return ErrInvalidPacket
	}
	count := int(binary.BigEndian.Uint16(payload[:2]))
	pos := 2
	paths := make([]pushedDirectPath, 0)
	for i := 0; i < count; i++ {
		if len(payload)-pos < 5 {
			return ErrInvalidPacket
		}
		flags := payload[pos]
		extensionLength := int(binary.BigEndian.Uint16(payload[pos+1 : pos+3]))
		pos += 3
		if len(payload)-pos < extensionLength+2 {
			return ErrInvalidPacket
		}
		pos += extensionLength
		addressType := payload[pos]
		addressLength := int(payload[pos+1])
		pos += 2
		if len(payload)-pos < addressLength {
			return ErrInvalidPacket
		}
		addressData := payload[pos : pos+addressLength]
		pos += addressLength
		var address netip.Addr
		var port uint16
		switch addressType {
		case 4:
			if addressLength != 6 {
				continue
			}
			address = netip.AddrFrom4([4]byte{addressData[0], addressData[1], addressData[2], addressData[3]})
			port = binary.BigEndian.Uint16(addressData[4:6])
		case 6:
			if addressLength != 18 {
				continue
			}
			var raw [16]byte
			copy(raw[:], addressData[:16])
			address = netip.AddrFrom16(raw)
			port = binary.BigEndian.Uint16(addressData[16:18])
		default:
			continue
		}
		if port == 0 || pathScope(address) == 0 {
			continue
		}
		paths = append(paths, pushedDirectPath{
			endpoint: netip.AddrPortFrom(address, port),
			forget:   flags&0x01 != 0,
			cluster:  flags&0x02 != 0,
		})
	}

	var countPerScope [8][2]uint8
	for _, pushed := range paths {
		endpoint := pushed.endpoint
		if pushed.forget {
			// The flag means not to contact this advertised address. ZeroTier One
			// does not invalidate a path that was authenticated independently.
			continue
		}
		if !n.pathAllowedLocked(peer, endpoint, localSocket) {
			continue
		}
		if !pushed.cluster && peerHasActiveEndpoint(peer, endpoint, now) {
			continue
		}
		scope := pathScope(endpoint.Addr())
		family := 0
		if endpoint.Addr().Is6() {
			family = 1
		}
		if !pushed.cluster {
			if countPerScope[scope][family] >= maxPushedPathsPerScopeAndFamily {
				continue
			}
			countPerScope[scope][family]++
		}
		priority := 1
		if pushed.cluster {
			if origin := peer.paths[pathKey{localSocket: localSocket, endpoint: remote}]; origin != nil {
				priority = origin.priority + 2
			} else {
				priority = 3
			}
		}
		if pushed.cluster {
			n.tracePeerRedirectedLocked(peer, pathKey{localSocket: localSocket, endpoint: endpoint})
			_ = n.sendClusterRedirectProbeLocked(peer, localSocket, endpoint, now, priority)
		} else {
			_ = n.sendPathProbeLocked(peer, localSocket, endpoint, now, priority)
		}
	}
	return nil
}

// handleNetworkConfigPushLocked accepts a controller-pushed configuration chunk.
func (n *Node) handleNetworkConfigPushLocked(localSocket int64, remote netip.AddrPort, peer *peer, packet *Packet, now time.Time) error {
	payload := packet.Payload()
	if len(payload) < 8 {
		return ErrInvalidPacket
	}
	networkID := binary.BigEndian.Uint64(payload[:8])
	network := n.networks[networkID]
	if network == nil {
		return nil
	}
	previousUpdateID := network.lastConfigUpdateID
	if err := n.handleNetworkConfigChunkLocked(packet, 0, now); err != nil {
		return err
	}
	if network.lastConfigUpdateID == 0 || network.lastConfigUpdateID == previousUpdateID {
		return nil
	}
	reply, err := NewPacket(peer.identity.Address(), n.identity.Address(), VerbOK)
	if err != nil {
		return err
	}
	// ZeroTier One uses ECHO here rather than NETWORK_CONFIG despite the
	// protocol comment describing this as a NETWORK_CONFIG acknowledgement.
	_ = reply.Append(byte(VerbEcho))
	_ = reply.AppendUint64(packet.PacketID())
	_ = reply.AppendUint64(networkID)
	_ = reply.AppendUint64(network.lastConfigUpdateID)
	_ = n.sendPacketViaPathLocked(peer, reply, true, pathKey{localSocket: localSocket, endpoint: remote}, false)
	return nil
}

// setNetworkFailureLocked updates a controller failure and emits only a real
// status or authentication-detail transition.
func (n *Node) setNetworkFailureLocked(network *Network, status NetworkStatus, authentication NetworkAuthenticationInfo, eventType EventType) {
	report := network.reportNextFailure
	network.reportNextFailure = false
	if !report && network.Status == status && network.Authentication == authentication {
		return
	}
	network.Status = status
	network.Authentication = authentication
	n.emitLocked(Event{Type: eventType, NetworkID: network.ID, Authentication: authentication})
}

// handleErrorLocked applies a peer or controller protocol error to pending state.
func (n *Node) handleErrorLocked(peer *peer, packet *Packet, now time.Time) error {
	payload := packet.Payload()
	if len(payload) < 10 {
		return ErrInvalidPacket
	}
	inReplyTo := Verb(payload[0])
	code := payload[9]
	switch code {
	case 0x03, 0x05:
		if inReplyTo == VerbNetworkConfigRequest && len(payload) < 18 {
			return ErrInvalidPacket
		}
	case 0x06, 0x07, 0x09:
		if len(payload) < 18 {
			return ErrInvalidPacket
		}
	case 0x08:
		if len(payload) < 28 {
			return ErrInvalidPacket
		}
	}
	if code == 0x04 && peer.root {
		n.emitLocked(Event{Type: EventNodeIdentityCollision})
		return authenticatedContentError(ErrIdentityCollision)
	}
	if code == 0x06 && len(payload) >= 18 {
		networkID := binary.BigEndian.Uint64(payload[10:18])
		if network := n.networks[networkID]; network != nil {
			if !peer.lastCredentialsRequest.IsZero() && now.Sub(peer.lastCredentialsRequest) < peerGeneralRateLimit {
				return nil
			}
			peer.lastCredentialsRequest = now
			delete(peer.credentialsSent, networkID)
			_ = n.sendCredentialsLocked(network, peer, now)
			return nil
		}
	}
	if code == 0x08 && len(payload) >= 28 {
		networkID := binary.BigEndian.Uint64(payload[10:18])
		network := n.networks[networkID]
		if network == nil || !network.allows(peer) {
			return nil
		}
		mac, err := MACFromBytes(payload[18:24])
		if err != nil || !mac.IsMulticast() {
			return nil
		}
		group := MulticastGroup{MAC: mac, ADI: binary.BigEndian.Uint32(payload[24:28])}
		if members := network.multicast[group]; members != nil {
			delete(members, peer.identity.Address())
		}
		return nil
	}
	if len(payload) >= 18 {
		networkID := binary.BigEndian.Uint64(payload[10:18])
		if network := n.networks[networkID]; network != nil && peer.identity.Address() == Controller(networkID) {
			switch code {
			case 0x07:
				n.setNetworkFailureLocked(network, NetworkStatusAccessDenied, NetworkAuthenticationInfo{}, EventNetworkAccessDenied)
				return nil
			case 0x03, 0x05:
				if inReplyTo != VerbNetworkConfigRequest {
					return nil
				}
				n.setNetworkFailureLocked(network, NetworkStatusNotFound, NetworkAuthenticationInfo{}, EventNetworkNotFound)
				return nil
			case 0x09:
				authentication, valid := parseAuthenticationInfo(payload[18:])
				if !valid {
					return nil
				}
				n.setNetworkFailureLocked(network, NetworkStatusAuthenticationRequired, authentication, EventNetworkAuthenticationRequired)
				return nil
			}
		}
	}
	return nil
}

// parseAuthenticationInfo extracts an authentication-required error payload.
func parseAuthenticationInfo(payload []byte) (NetworkAuthenticationInfo, bool) {
	// The official core treats an absent auth dictionary as an implicit v0
	// authentication request, but ignores a present malformed dictionary.
	if len(payload) <= 2 {
		return NetworkAuthenticationInfo{}, true
	}
	length := int(binary.BigEndian.Uint16(payload))
	if length > len(payload)-2 {
		return NetworkAuthenticationInfo{}, false
	}
	dictionary, err := ParseDictionary(payload[2 : 2+length])
	if err != nil {
		return NetworkAuthenticationInfo{}, false
	}
	info := NetworkAuthenticationInfo{Version: dictionary.Uint("aV", 0)}
	if info.Version == 0 {
		info.AuthenticationURL = dictionaryString(dictionary, "aU", maxAuthenticationURL)
		return info, info.AuthenticationURL != ""
	}
	if info.Version != 1 {
		return NetworkAuthenticationInfo{}, false
	}
	info.IssuerURL = dictionaryString(dictionary, "iU", maxAuthenticationURL)
	info.CentralAuthURL = dictionaryString(dictionary, "aCU", maxAuthenticationURL)
	info.Nonce = dictionaryString(dictionary, "aN", maxSSONonceLength)
	info.State = dictionaryString(dictionary, "aS", maxSSOStateLength)
	info.ClientID = dictionaryString(dictionary, "aCID", maxSSOClientIDLength)
	info.Provider = dictionaryString(dictionary, "aSSOp", maxSSOProviderLength)
	if info.Provider == "" {
		info.Provider = "default"
	}
	return info, true
}

// newNetwork allocates the mutable state for a newly joined network.
func newNetwork(networkID uint64) *Network {
	return &Network{
		ID:                     networkID,
		Status:                 NetworkStatusRequestingConfiguration,
		members:                make(map[Address]CertificateOfMembership),
		ownership:              make(map[Address][]CertificateOfOwnership),
		tags:                   make(map[Address][]Tag),
		capabilities:           make(map[Address][]Capability),
		revocations:            make(map[Address]map[uint64]uint64),
		associated:             make(map[Address]time.Time),
		bridgeRoutes:           make(map[MAC]bridgeRoute),
		multicast:              make(map[MulticastGroup]map[Address]time.Time),
		pendingMulticast:       make(map[MulticastGroup][]pendingMulticastFrame),
		multicastSubscriptions: make(map[MulticastGroup]struct{}),
		lastMulticastGather:    make(map[MulticastGroup]time.Time),
		multicastAnnouncements: make(map[Address]time.Time),
		assemblies:             make(map[uint64]*configAssembly),
	}
}

// flushPeerQueuesLocked retries work that was waiting for address identity.
func (n *Node) flushPeerQueuesLocked(address Address, now time.Time) {
	peer := n.peers[address]
	if peer == nil {
		return
	}
	pending := n.pendingIncoming[address]
	kept := pending[:0]
	for _, packet := range pending {
		err := n.processWirePacketLocked(&packet, now, false)
		if now.Sub(packet.receivedAt) <= pendingIncomingExpiration && (errors.Is(err, ErrUnknownPeer) || errors.Is(err, errPacketRetry)) {
			packet.lastTried = now
			kept = append(kept, packet)
		}
	}
	if len(kept) != 0 {
		n.pendingIncoming[address] = kept
	} else {
		delete(n.pendingIncoming, address)
	}
	for _, frame := range n.pendingFrames[address] {
		if now.Sub(frame.createdAt) > pendingTransmitExpiration {
			continue
		}
		if network := n.networks[frame.frame.NetworkID]; network != nil && network.Status == NetworkStatusOK {
			if frame.extended {
				_ = n.sendRuleFrameWithFlowLocked(network, address, frame.frame, frame.extendedFlags, frame.payloadLength, frame.flowID, now)
			} else {
				_ = n.queueOrSendFrameLocked(network, address, frame.frame, frame.flowID, now)
			}
		}
	}
	delete(n.pendingFrames, address)
	for _, message := range n.pendingUserMessages[address] {
		if now.Sub(message.createdAt) <= pendingTransmitExpiration {
			_ = n.sendUserMessageLocked(peer, message.typeID, message.data)
		}
	}
	delete(n.pendingUserMessages, address)
	for _, trace := range n.pendingRemoteTraces[address] {
		if now.Sub(trace.createdAt) <= pendingTransmitExpiration {
			n.sendRemoteTraceDataLocked(peer, trace.data)
		}
	}
	delete(n.pendingRemoteTraces, address)
	for _, network := range n.networks {
		for updateID, assembly := range network.assemblies {
			if now.Sub(assembly.updatedAt) > 30*time.Second {
				delete(network.assemblies, updateID)
			}
		}
		isBridge := network.Config.isSpecialist(address, specialistTypeActiveBridge)
		for group, members := range network.multicast {
			if _, ok := members[address]; ok || isBridge {
				n.flushPendingMulticastLocked(network, group, now)
			}
		}
	}
	n.retryPendingTransmitsLocked(address, now)
}

// sendPacketLocked sends packet using its derived bonding flow.
func (n *Node) sendPacketLocked(peer *peer, packet *Packet, encrypt bool) error {
	return n.sendPacketWithFlowLocked(peer, packet, encrypt, noFlowID)
}

// sendPacketWithFlowLocked sends packet using an explicit bonding flow.
func (n *Node) sendPacketWithFlowLocked(peer *peer, packet *Packet, encrypt bool, flowID int32) error {
	now := time.Now()
	if err := packet.Err(); err != nil {
		return err
	}
	err := n.trySendPacketWithFlowLocked(peer, packet, encrypt, flowID, now)
	if !errors.Is(err, errNoPath) {
		return err
	}
	n.enqueuePendingTransmitLocked(packet, encrypt, flowID, now)
	return nil
}

// trySendPacketWithFlowLocked selects paths, armors packet, and attempts output.
func (n *Node) trySendPacketWithFlowLocked(peer *peer, packet *Packet, encrypt bool, flowID int32, now time.Time) error {
	directPath := n.bestDirectPeerPathLocked(peer, now)
	if !peer.root && !directPath.endpoint.IsValid() {
		n.tryMemorizedPathsLocked(peer, now)
	}
	reportUserRoute := !peer.root && userTrafficVerb(packet.Verb())
	var singlePath [1]pathKey
	paths := n.bondedPathsLocked(peer, packet.Verb(), flowID, packet.PacketID(), now, singlePath[:0])
	if len(paths) == 0 {
		return errNoPath
	}
	directRoute := false
	for _, path := range paths {
		if peer.paths[path] != nil {
			directRoute = true
			break
		}
	}
	if len(paths) == 1 {
		err := n.sendPacketViaPathWithFlowLocked(peer, packet, encrypt, paths[0], false, flowID)
		if err == nil && reportUserRoute {
			n.observePeerUserRouteLocked(peer, directRoute, paths[0].endpoint, 1, now)
		}
		return err
	}
	clearPacket := packet.Clone()
	oldPacketID := packet.PacketID()
	pending, hasPending := n.pending[oldPacketID]
	var sendErr error
	var sentPacketPaths map[uint64]*pendingReplyPaths
	if hasPending {
		n.deletePendingLocked(oldPacketID)
		pending.slot = 0
		pending.generation = 0
		sentPacketPaths = make(map[uint64]*pendingReplyPaths, len(paths))
	}
	sentPaths := make([]pathKey, 0, len(paths))
	for i, path := range paths {
		candidate := clearPacket.Clone()
		if i == 0 {
			candidate = packet
		}
		if hasPending {
			// Armor moves this temporary, unowned entry to the candidate ID.
			// Successful copies are registered in the fixed ring after every
			// selected path has been attempted.
			n.pending[oldPacketID] = pending
		}
		err := n.sendPacketViaPathWithFlowLocked(peer, candidate, encrypt, path, false, flowID)
		candidatePacketID := candidate.PacketID()
		if hasPending {
			if tracked, ok := n.pending[candidatePacketID]; ok && tracked == pending {
				n.deletePendingLocked(candidatePacketID)
			}
			if tracked, ok := n.pending[oldPacketID]; ok && tracked == pending {
				n.deletePendingLocked(oldPacketID)
			}
		}
		if err != nil {
			sendErr = errors.Join(sendErr, err)
		} else {
			if hasPending {
				replies := sentPacketPaths[candidatePacketID]
				if replies == nil {
					replies = &pendingReplyPaths{remaining: make(map[pathKey]struct{})}
					sentPacketPaths[candidatePacketID] = replies
				}
				replies.remaining[path] = struct{}{}
			}
			sentPaths = append(sentPaths, path)
		}
	}
	if hasPending {
		for packetID, replies := range sentPacketPaths {
			request := pending
			request.replyPaths = replies
			// Armor already rejected collisions while the temporary entry was
			// present, and Node.mu excludes a new one between that check and here.
			_ = n.addPendingLocked(packetID, request)
		}
	}
	if reportUserRoute && len(sentPaths) != 0 {
		endpoint := netip.AddrPort{}
		if len(sentPaths) == 1 {
			endpoint = sentPaths[0].endpoint
		}
		n.observePeerUserRouteLocked(peer, directRoute, endpoint, len(sentPaths), now)
	}
	if len(sentPaths) != 0 {
		return nil
	}
	return sendErr
}

// userTrafficVerb reports whether verb carries embedding-provided network
// traffic rather than protocol maintenance.
func userTrafficVerb(verb Verb) bool {
	switch verb {
	case VerbFrame, VerbExtFrame, VerbMulticastFrame:
		return true
	default:
		return false
	}
}

// observePeerUserRouteLocked reports successful route-kind, direct-endpoint,
// and bonded-path-count changes. Same-kind changes are coalesced so a path
// whose quality straddles another path cannot turn diagnostics into load while
// the final observed state is still reported.
func (n *Node) observePeerUserRouteLocked(peer *peer, direct bool, endpoint netip.AddrPort, pathCount int, now time.Time) {
	route := PeerRouteRelayed
	if direct {
		route = PeerRouteDirect
		if pathCount != 1 {
			endpoint = netip.AddrPort{}
		}
	} else {
		endpoint = netip.AddrPort{}
		pathCount = 0
	}
	if peer.reportedUserRoute == route && peer.reportedUserEndpoint == endpoint && peer.reportedUserPathCount == pathCount {
		peer.pendingUserRoute = PeerRouteUnknown
		peer.pendingUserEndpoint = netip.AddrPort{}
		peer.pendingUserPathCount = 0
		return
	}
	deadline := peer.lastUserRouteReport.Add(peerRouteReportInterval)
	if peer.reportedUserRoute == route && !peer.lastUserRouteReport.IsZero() && now.Before(deadline) {
		peer.pendingUserRoute = route
		peer.pendingUserEndpoint = endpoint
		peer.pendingUserPathCount = pathCount
		return
	}
	n.emitPeerUserRouteLocked(peer, route, endpoint, pathCount, now)
}

// flushPendingPeerUserRouteLocked emits the latest coalesced route detail once
// its rate-limit window has elapsed.
func (n *Node) flushPendingPeerUserRouteLocked(peer *peer, now time.Time) {
	if peer.pendingUserRoute == PeerRouteUnknown || now.Before(peer.lastUserRouteReport.Add(peerRouteReportInterval)) {
		return
	}
	n.emitPeerUserRouteLocked(peer, peer.pendingUserRoute, peer.pendingUserEndpoint, peer.pendingUserPathCount, now)
}

// emitPeerUserRouteLocked records and queues one selected user route.
func (n *Node) emitPeerUserRouteLocked(peer *peer, route PeerRoute, endpoint netip.AddrPort, pathCount int, now time.Time) {
	peer.reportedUserRoute = route
	peer.reportedUserEndpoint = endpoint
	peer.reportedUserPathCount = pathCount
	peer.lastUserRouteReport = now
	peer.pendingUserRoute = PeerRouteUnknown
	peer.pendingUserEndpoint = netip.AddrPort{}
	peer.pendingUserPathCount = 0
	n.emitLocked(Event{
		Type: EventPeerRouteChanged, PeerAddress: peer.identity.Address(), PeerRole: peer.role,
		Route: route, Endpoint: endpoint, PathCount: pathCount,
	})
}

// enqueuePendingTransmitLocked retains a packet until its destination is known.
func (n *Node) enqueuePendingTransmitLocked(packet *Packet, encrypt bool, flowID int32, now time.Time) {
	if len(n.pendingTransmits) >= maxPendingTransmits {
		dropped := n.pendingTransmits[0]
		n.deletePendingLocked(dropped.packet.PacketID())
		copy(n.pendingTransmits, n.pendingTransmits[1:])
		n.pendingTransmits[len(n.pendingTransmits)-1] = pendingTransmit{}
		n.pendingTransmits = n.pendingTransmits[:len(n.pendingTransmits)-1]
	}
	n.pendingTransmits = append(n.pendingTransmits, pendingTransmit{
		packet: packet.Clone(), encrypt: encrypt, flowID: flowID, createdAt: now,
	})
}

// retryPendingTransmitsLocked retries non-expired deferred packet output. A
// zero destination retries the whole queue; otherwise only that peer's
// packets are considered, matching ZeroTier One's peer-discovery wakeup.
func (n *Node) retryPendingTransmitsLocked(destination Address, now time.Time) {
	if len(n.pendingTransmits) == 0 {
		return
	}
	transmits := n.pendingTransmits
	kept := transmits[:0]
	for _, transmit := range transmits {
		if now.Sub(transmit.createdAt) > pendingTransmitExpiration {
			n.deletePendingLocked(transmit.packet.PacketID())
			continue
		}
		if !destination.IsZero() && transmit.packet.Destination() != destination {
			kept = append(kept, transmit)
			continue
		}
		peer := n.peers[transmit.packet.Destination()]
		if peer == nil {
			kept = append(kept, transmit)
			continue
		}
		originalPacketID := transmit.packet.PacketID()
		request, tracked := n.pending[originalPacketID]
		err := n.trySendPacketWithFlowLocked(peer, transmit.packet, transmit.encrypt, transmit.flowID, now)
		if errors.Is(err, errNoPath) {
			kept = append(kept, transmit)
		} else if err != nil && tracked {
			// The queue cannot report asynchronous physical-send failures to its
			// original caller. Drop only this request's tracking under either ID;
			// armor may have changed it before the sender returned the error.
			if pending, ok := n.pending[originalPacketID]; ok && pending == request {
				n.deletePendingLocked(originalPacketID)
			}
			packetID := transmit.packet.PacketID()
			if pending, ok := n.pending[packetID]; ok && pending == request {
				n.deletePendingLocked(packetID)
			}
		}
	}
	for i := len(kept); i < len(transmits); i++ {
		transmits[i] = pendingTransmit{}
	}
	n.pendingTransmits = kept
}

// tryMemorizedPathsLocked probes cached endpoints for a peer without live paths.
func (n *Node) tryMemorizedPathsLocked(peer *peer, now time.Time) {
	configured, haveConfigured := n.peerPaths[peer.identity.Address()]
	if n.pathLookup == nil && !haveConfigured {
		return
	}
	if !peer.lastPathLookup.IsZero() && now.Sub(peer.lastPathLookup) < memorizedPathRetryPeriod {
		return
	}
	peer.lastPathLookup = now
	endpoints := append([]netip.AddrPort(nil), configured.Try...)
	if n.pathLookup != nil {
		endpoints = append(endpoints, n.pathLookup(peer.identity.Address())...)
	}
	for _, endpoint := range endpoints {
		if !n.pathAllowedLocked(peer, endpoint, AnyLocalSocket) {
			continue
		}
		_ = n.sendPathProbeLocked(peer, AnyLocalSocket, endpoint, now)
	}
}

// sendPacketViaPathLocked armors and transmits packet on one explicit path.
func (n *Node) sendPacketViaPathLocked(peer *peer, packet *Packet, encrypt bool, path pathKey, extendedHello bool) error {
	return n.sendPacketViaPathWithFlowLocked(peer, packet, encrypt, path, extendedHello, noFlowID)
}

// sendPacketViaPathWithFlowLocked transmits packet on path and records its flow.
func (n *Node) sendPacketViaPathWithFlowLocked(peer *peer, packet *Packet, encrypt bool, path pathKey, extendedHello bool, flowID int32) error {
	if err := packet.Err(); err != nil {
		return err
	}
	verb := packet.Verb()
	payloadLength := len(packet.Payload())
	mtu, trustedPathID := n.outboundPathInfoLocked(path.endpoint)
	wireLength := len(packet.Bytes())
	if extendedHello {
		wireLength += extendedArmorKeySize
	}
	packet.SetFragmented(wireLength > mtu)
	oldPacketID := packet.PacketID()
	if trustedPathID != 0 {
		packet.SetTrusted(trustedPathID)
	} else if extendedHello {
		if err := packet.ArmorExtended(peer.key[:], peer.identity); err != nil {
			return err
		}
	} else if err := n.armorForPeerLocked(peer, packet, encrypt); err != nil {
		return err
	}
	if err := n.movePendingPacketIDLocked(oldPacketID, packet.PacketID()); err != nil {
		return err
	}
	now := time.Now()
	packetID := packet.PacketID()
	n.recordOutgoingBondPacketLocked(peer, path, packetID, payloadLength, verb, flowID, now)
	sent, err := n.sendWirePacketViaPathLocked(path, packet.takeBytes(), mtu)
	if sent {
		n.noteWirePathSendLocked(path, now)
		if state := peer.paths[path]; state != nil {
			state.lastSend = now
		}
	}
	return err
}

// movePendingPacketIDLocked transfers request tracking after packet re-armor.
func (n *Node) movePendingPacketIDLocked(oldPacketID, newPacketID uint64) error {
	if newPacketID == oldPacketID {
		return nil
	}
	request, ok := n.pending[oldPacketID]
	if !ok {
		return nil
	}
	if existing, exists := n.pending[newPacketID]; exists {
		if existing != request {
			return errors.New("duplicate ZeroTier packet ID")
		}
	}
	delete(n.pending, oldPacketID)
	n.pending[newPacketID] = request
	if request.generation != 0 && request.slot >= 0 && request.slot < len(n.pendingSlots) {
		slot := &n.pendingSlots[request.slot]
		if slot.packetID == oldPacketID && slot.generation == request.generation {
			slot.packetID = newPacketID
		}
	}
	return nil
}

// consumePendingReplyLocked records the responding physical path. Broadcast
// copies can share a packet ID, so a duplicate response from one path must not
// consume the response expected from another path.
func (n *Node) consumePendingReplyLocked(packetID uint64, request pendingRequest, path pathKey) {
	// A full HELLO and any request sent through AnyLocalSocket can be fanned
	// out by the embedding transport without exposing the concrete sockets to
	// Node. Keep their packet ID in the bounded expectation window so every
	// physical response can authenticate its path.
	if request.verb == VerbHello || request.path.localSocket == AnyLocalSocket && request.path.endpoint.IsValid() {
		return
	}
	if request.replyPaths != nil {
		if _, expected := request.replyPaths.remaining[path]; !expected {
			return
		}
		delete(request.replyPaths.remaining, path)
		if len(request.replyPaths.remaining) != 0 {
			return
		}
	}
	n.deletePendingLocked(packetID)
}

// outboundPathInfoLocked returns configured MTU and trusted-path ID for endpoint.
func (n *Node) outboundPathInfoLocked(endpoint netip.AddrPort) (int, uint64) {
	mtu := n.physicalMTU
	address := endpoint.Addr().Unmap()
	for _, physicalPath := range n.physicalPaths {
		if physicalPath.Network.Contains(address) {
			if physicalPath.MTU != 0 {
				mtu = physicalPath.MTU
			}
			return mtu, physicalPath.TrustedPathID
		}
	}
	return mtu, 0
}

// inboundPathTrustedLocked validates a trusted-path ID against endpoint policy.
func (n *Node) inboundPathTrustedLocked(endpoint netip.AddrPort, trustedPathID uint64) bool {
	if trustedPathID == 0 {
		return false
	}
	address := endpoint.Addr().Unmap()
	for _, physicalPath := range n.physicalPaths {
		if physicalPath.TrustedPathID == trustedPathID && physicalPath.Network.Contains(address) {
			return true
		}
	}
	return false
}

// sendWirePacketViaPathLocked fragments data to mtu and transfers each wire
// piece to the sender. The caller must not use data after this call. The
// boolean result reports whether at least one physical datagram was sent.
func (n *Node) sendWirePacketViaPathLocked(path pathKey, data []byte, mtu int) (bool, error) {
	if len(data) <= mtu {
		err := n.sender.Send(path.localSocket, path.endpoint, data[:len(data):len(data)])
		return err == nil, err
	}
	remaining := len(data) - mtu
	fragmentPayload := mtu - FragmentHeaderSize
	total := 1 + (remaining+fragmentPayload-1)/fragmentPayload
	if total > 7 {
		return false, ErrInvalidPacket
	}
	var fragments [6][]byte
	fragmentCount := 0
	for number, start := 1, mtu; start < len(data); number, start = number+1, start+fragmentPayload {
		end := start + fragmentPayload
		if end > len(data) {
			end = len(data)
		}
		fragment := make([]byte, FragmentHeaderSize+end-start)
		copy(fragment[:13], data[:13])
		fragment[13] = 0xff
		fragment[14] = byte(total<<4 | number)
		copy(fragment[FragmentHeaderSize:], data[start:end])
		fragments[fragmentCount] = fragment[:len(fragment):len(fragment)]
		fragmentCount++
	}
	// Finish every read from data before handing its storage to WireSender. The
	// sender may retain each capacity-limited datagram after Send returns.
	if err := n.sender.Send(path.localSocket, path.endpoint, data[:mtu:mtu]); err != nil {
		return false, err
	}
	for index := 0; index < fragmentCount; index++ {
		if err := n.sender.Send(path.localSocket, path.endpoint, fragments[index]); err != nil {
			return true, err
		}
	}
	return true, nil
}

// armorForPeerLocked applies the negotiated packet protection for peer.
func (n *Node) armorForPeerLocked(peer *peer, packet *Packet, encrypt bool) error {
	if encrypt && peer.protocol >= 12 {
		return packet.armorAESWithKeys(&peer.aesKeys)
	}
	return packet.Armor(peer.key[:], encrypt)
}

// bestPeerEndpointLocked returns the endpoint of the current best peer path.
func (n *Node) bestPeerEndpointLocked(peer *peer) netip.AddrPort {
	return n.bestPeerPathLocked(peer, time.Now()).endpoint
}

// bestPeerPathLocked follows the official send fallback order: an unexpired
// direct path, an upstream relay, then a retained expired direct path.
func (n *Node) bestPeerPathLocked(peer *peer, now time.Time) pathKey {
	if selected := n.bestDirectPeerPathLocked(peer, now); selected.endpoint.IsValid() {
		return selected
	}
	_, selected := n.bestRootPeerPathLocked(now)
	if selected.endpoint.IsValid() {
		return selected
	}
	return n.bestPeerPathCandidateLocked(peer, now, true)
}

// bestDirectPeerPathLocked ranks eligible direct paths by priority and quality.
func (n *Node) bestDirectPeerPathLocked(peer *peer, now time.Time) pathKey {
	return n.bestPeerPathCandidateLocked(peer, now, false)
}

// bestPeerPathCandidateLocked ranks retained peer paths. includeExpired is
// used only as the final send fallback after no upstream relay is available.
func (n *Node) bestPeerPathCandidateLocked(peer *peer, now time.Time, includeExpired bool) pathKey {
	var selected pathKey
	bestQuality := time.Duration(1<<63 - 1)
	haveSelection := false
	for candidate, path := range peer.paths {
		quality, valid := n.directPeerPathQualityLocked(peer, candidate, path, now, includeExpired)
		if !valid {
			continue
		}
		if !haveSelection || quality < bestQuality || quality == bestQuality && pathKeyLess(candidate, selected) {
			bestQuality = quality
			selected = candidate
			haveSelection = true
		}
	}
	return selected
}

// directPeerPathQualityLocked implements the legacy Path::quality score used
// by the official core. Time values are reduced to its millisecond clock so
// scheduler precision cannot manufacture path preference changes.
func (n *Node) directPeerPathQualityLocked(peer *peer, candidate pathKey, path *peerPathState, now time.Time, includeExpired bool) (time.Duration, bool) {
	authenticatedAge := now.Sub(path.lastReceive)
	if authenticatedAge < 0 {
		authenticatedAge = 0
	}
	authenticatedAge = authenticatedAge / time.Millisecond * time.Millisecond
	if !includeExpired && authenticatedAge >= peerPathExpiration {
		return 0, false
	}
	scope := pathScope(candidate.endpoint.Addr())
	if scope == 0 {
		return 0, false
	}
	priority := path.priority
	if priority <= 0 {
		priority = 1
	}
	quality := pathLatency(path)
	physicalAge := wirePathAge(path, now) / time.Millisecond * time.Millisecond
	if physicalAge >= peerPathActiveTime {
		qualityAge := physicalAge
		if maximumAge := 10 * peerPathPingPeriod; qualityAge > maximumAge {
			qualityAge = maximumAge
		}
		quality += unknownPathLatency + qualityAge
	}
	quality *= time.Duration(8 - scope)
	quality /= time.Duration(priority)
	return quality, true
}

// pathScope mirrors InetAddress::ipScope and Path::isAddressValidForPath in
// ZeroTier One. Only scopes supported for physical ZeroTier traffic are
// returned; link-local paths cannot be represented with an interface zone.
func pathScope(address netip.Addr) int {
	address = address.Unmap()
	if !address.IsValid() {
		return 0
	}
	if address.Is4() {
		raw := address.As4()
		value := binary.BigEndian.Uint32(raw[:])
		switch raw[0] {
		case 0, 127, 255:
			return 0
		case 6, 11, 21, 22, 25, 26, 28, 29, 30, 51, 55, 56:
			return 3
		case 10:
			return 7
		case 100:
			if value&0xffc00000 == 0x64400000 {
				return 7
			}
		case 169:
			if value&0xffff0000 == 0xa9fe0000 {
				return 0
			}
		case 172:
			if value&0xfff00000 == 0xac100000 {
				return 7
			}
		case 192:
			if value&0xffff0000 == 0xc0a80000 || value&0xffffff00 == 0xc0000200 {
				return 7
			}
		case 198:
			if value&0xfffe0000 == 0xc6120000 || value&0xffffff00 == 0xc6336400 {
				return 7
			}
		case 203:
			if value&0xffffff00 == 0xcb007100 {
				return 7
			}
		}
		if raw[0]&0xf0 == 0xe0 {
			return 0
		}
		if raw[0]&0xf0 == 0xf0 {
			return 3
		}
		return 4
	}
	raw := address.As16()
	if address.IsUnspecified() || address.IsLoopback() || address.IsMulticast() || address.IsLinkLocalUnicast() {
		return 0
	}
	if raw[0]&0xfe == 0xfc {
		return 7
	}
	// ZeroTier One blacklists HE tunnelbroker paths due to unstable MTU and
	// latency characteristics.
	if raw[0] == 0x20 && raw[1] == 0x01 && raw[2] == 0x04 && raw[3] == 0x70 {
		return 0
	}
	return 4
}

// IsGlobalPhysicalAddress reports whether address has ZeroTier's global
// IP scope. It intentionally does not apply additional path-validity filters
// such as the HE tunnel exclusion.
func IsGlobalPhysicalAddress(address netip.Addr) bool {
	address = address.Unmap()
	if !address.IsValid() {
		return false
	}
	if address.Is4() {
		return pathScope(address) == 4
	}
	raw := address.As16()
	return !address.IsUnspecified() && !address.IsLoopback() && !address.IsMulticast() &&
		!address.IsLinkLocalUnicast() && raw[0]&0xfe != 0xfc
}

// pathAllowedLocked applies physical network and peer path restrictions.
func (n *Node) pathAllowedLocked(peer *peer, endpoint netip.AddrPort, localSockets ...int64) bool {
	if !endpoint.IsValid() || endpoint.Port() == 0 || pathScope(endpoint.Addr()) == 0 {
		return false
	}
	if peer.root && !n.rootEndpointAllowedLocked(peer.identity.Address(), endpoint.Addr()) {
		return false
	}
	for _, physicalPath := range n.physicalPaths {
		if physicalPath.Blacklist && physicalPath.Network.Contains(endpoint.Addr().Unmap()) {
			return false
		}
	}
	if configured, exists := n.peerPaths[peer.identity.Address()]; exists {
		for _, network := range configured.Blacklist {
			if network.Contains(endpoint.Addr().Unmap()) {
				return false
			}
		}
	}
	for _, network := range n.networks {
		for _, assigned := range network.Config.Assigned {
			if assigned.Contains(endpoint.Addr()) {
				return false
			}
		}
	}
	localSocket := AnyLocalSocket
	if len(localSockets) != 0 {
		localSocket = localSockets[0]
	}
	if n.pathCheck != nil && !n.pathCheck(peer.identity.Address(), localSocket, endpoint) {
		return false
	}
	return true
}

// rootEndpointAllowedLocked validates an endpoint against a root definition.
func (n *Node) rootEndpointAllowedLocked(address Address, endpoint netip.Addr) bool {
	foundRoot := false
	for _, root := range n.allRootsLocked() {
		if root.Identity.Address() != address {
			continue
		}
		foundRoot = true
		if len(root.Endpoints) == 0 {
			return true
		}
		for _, stable := range root.Endpoints {
			if stable.Addr().Unmap() == endpoint.Unmap() {
				return true
			}
		}
	}
	return !foundRoot
}

// SurfaceAddresses returns the external UDP endpoints reported by authenticated
// peers. Reports are advisory; only trusted-root changes reset active paths.
func (n *Node) SurfaceAddresses() []netip.AddrPort {
	n.mu.Lock()
	seen := make(map[netip.AddrPort]struct{}, len(n.surfaces))
	addresses := make([]netip.AddrPort, 0, len(n.surfaces))
	for _, surface := range n.surfaces {
		if _, ok := seen[surface.endpoint]; !ok {
			seen[surface.endpoint] = struct{}{}
			addresses = append(addresses, surface.endpoint)
		}
	}
	n.mu.Unlock()
	return addresses
}

// observeSurfaceLocked records a peer report of the local external endpoint.
func (n *Node) observeSurfaceLocked(reporter *peer, localSocket int64, remote, external netip.AddrPort, now time.Time) {
	scope := pathScope(external.Addr())
	if scope == 0 || scope != pathScope(remote.Addr()) || external.Addr().Is6() != remote.Addr().Is6() {
		return
	}
	key := surfaceKey{reporter: reporter.identity.Address(), path: pathKey{localSocket: localSocket, endpoint: remote}, scope: scope}
	previous, exists := n.surfaces[key]
	trusted := reporter.root
	if !exists && len(n.surfaces) >= maxSurfaceEntries {
		var oldestKey surfaceKey
		var oldest time.Time
		for candidate, state := range n.surfaces {
			if oldest.IsZero() || state.updated.Before(oldest) {
				oldestKey, oldest = candidate, state.updated
			}
		}
		delete(n.surfaces, oldestKey)
	}
	n.surfaces[key] = surfaceState{endpoint: external, updated: now, trusted: trusted}
	if !trusted || !exists || now.Sub(previous.updated) >= 10*time.Minute || previous.endpoint.Addr().Unmap() == external.Addr().Unmap() {
		return
	}
	n.traceSurfaceResetLocked(reporter, remote, external, scope)
	for otherKey := range n.surfaces {
		if otherKey != key && otherKey.scope == scope && otherKey.path.endpoint != remote {
			delete(n.surfaces, otherKey)
		}
	}
	resetPaths := 0
	for _, candidate := range n.peers {
		for path, state := range candidate.paths {
			if path.endpoint.Addr().Is6() == external.Addr().Is6() && pathScope(path.endpoint.Addr()) == scope {
				state.lastReceive = time.Time{}
				_ = n.sendPathProbeLocked(candidate, path.localSocket, path.endpoint, now)
				resetPaths++
			}
		}
	}
	n.emitLocked(Event{
		Type: EventLocalSurfaceChanged, ReporterAddress: reporter.identity.Address(), PeerRole: reporter.role,
		Endpoint: external, PreviousEndpoint: previous.endpoint,
		PathCount: resetPaths,
	})
}

// observeAuthenticatedPathLocked records a path without packet-specific trace
// context.
func (n *Node) observeAuthenticatedPathLocked(peer *peer, localSocket int64, remote netip.AddrPort, verb Verb, now time.Time) {
	n.observeAuthenticatedPacketPathLocked(peer, localSocket, remote, verb, 0, 0, now)
}

// observeAuthenticatedPacketPathLocked refreshes a path and emits discovery
// traces when it is new.
func (n *Node) observeAuthenticatedPacketPathLocked(peer *peer, localSocket int64, remote netip.AddrPort, verb Verb, packetID, networkID uint64, now time.Time) {
	key := pathKey{localSocket: localSocket, endpoint: remote}
	if path := peer.paths[key]; path != nil {
		path.lastReceive = now
		delete(peer.pathProbe, key)
		n.maybePushDirectPathsLocked(peer, key, now, true)
		return
	}
	if n.bondingPolicyForPeerLocked(peer) == BondingNone {
		remoteIP := remote.Addr().Unmap()
		for known, path := range peer.paths {
			if known.localSocket == localSocket && known.endpoint.Addr().Unmap() == remoteIP && wirePathAge(path, now) < peerPathActiveTime {
				return
			}
		}
	}
	if !n.pathAllowedLocked(peer, remote, localSocket) {
		return
	}
	if verb == VerbOK {
		if len(peer.paths) >= maxPeerPaths && !n.evictOldestPathLocked(peer, now) {
			return
		}
		n.addPeerPathLocked(peer, key, &peerPathState{lastReceive: now, lastProbe: now, priority: 1}, now)
		peer.bondLastMaintenance = time.Time{}
		delete(peer.pathProbe, key)
		n.maybePushDirectPathsLocked(peer, key, now, true)
		n.emitLocked(Event{
			Type: EventPeerPathLearned, PeerAddress: peer.identity.Address(), PeerRole: peer.role,
			NetworkID: networkID, Endpoint: remote, PathCount: 1,
		})
		n.tracePeerLearnedPathLocked(networkID, peer, key, packetID)
		return
	}
	// ZeroTier One confirms a path learned from authenticated traffic with a
	// full HELLO and emits the confirming trace only when the one-second probe
	// gate admits that HELLO. A lightweight ECHO is reserved for known paths.
	if sent, _ := n.sendPathProbeForNetworkModeLocked(peer, localSocket, remote, networkID, now, true); sent {
		n.tracePeerConfirmingPathLocked(networkID, peer, key, packetID, verb)
	}
	n.maybePushDirectPathsLocked(peer, key, now, false)
}

// maybePushDirectPathsLocked advertises local direct candidates when due.
func (n *Node) maybePushDirectPathsLocked(peer *peer, path pathKey, now time.Time, havePath bool) {
	if !n.peerTrustedLocked(peer, now) {
		return
	}
	interval := directPathPushInterval
	if havePath {
		interval = directPathPushHavePathInterval
		if n.lowBandwidth {
			interval *= 16
		}
	}
	if !peer.lastDirectPathPushSent.IsZero() && now.Sub(peer.lastDirectPathPushSent) < interval {
		return
	}
	peer.lastDirectPathPushSent = now
	candidates := n.directPathCandidatesLocked()
	if len(candidates) == 0 {
		return
	}
	for len(candidates) != 0 {
		items := make([]byte, 0, 1150)
		count := 0
		for count < len(candidates) {
			encoded := appendPushedDirectPath(nil, candidates[count])
			if len(items) != 0 && PacketPayloadOffset+2+len(items)+len(encoded) >= 1200 {
				break
			}
			items = append(items, encoded...)
			count++
		}
		packet, err := NewPacket(peer.identity.Address(), n.identity.Address(), VerbPushDirectPaths)
		if err != nil {
			return
		}
		_ = packet.AppendUint16(uint16(count))
		_ = packet.Append(items...)
		_ = packet.Compress()
		_ = n.sendPacketViaPathLocked(peer, packet, true, path, false)
		candidates = candidates[count:]
	}
}

// appendPushedDirectPath serializes one direct endpoint advertisement.
func appendPushedDirectPath(dst []byte, endpoint netip.AddrPort) []byte {
	dst = append(dst, 0, 0, 0) // flags and extension length
	if endpoint.Addr().Is4() {
		raw := endpoint.Addr().As4()
		dst = append(dst, 4, 6)
		dst = append(dst, raw[:]...)
	} else {
		raw := endpoint.Addr().As16()
		dst = append(dst, 6, 18)
		dst = append(dst, raw[:]...)
	}
	return binary.BigEndian.AppendUint16(dst, endpoint.Port())
}

// peerTrustedLocked reports whether peer has recently established network trust.
func (n *Node) peerTrustedLocked(peer *peer, now time.Time) bool {
	if peer.root {
		return true
	}
	return !peer.lastTrustEstablished.IsZero() && now.Sub(peer.lastTrustEstablished) < trustExpiration
}

// markNetworkTrustLocked refreshes peer trust after valid network credentials.
func (n *Node) markNetworkTrustLocked(network *Network, peer *peer, now time.Time) {
	peer.lastTrustEstablished = now
	address := peer.identity.Address()
	associatedAt, associated := network.associated[address]
	network.associated[address] = now
	if !associated || now.Sub(associatedAt) >= trustExpiration {
		delete(network.multicastAnnouncements, address)
		n.announceMulticastToPeerLocked(network, peer, n.subscribedMulticastGroupsLocked(network), now)
	}
}

// directPathCandidatesLocked filters embedding-provided endpoints for
// advertisement.
func (n *Node) directPathCandidatesLocked() []netip.AddrPort {
	seen := make(map[netip.AddrPort]struct{})
	result := make([]netip.AddrPort, 0)
	appendCandidate := func(endpoint netip.AddrPort) {
		if !endpoint.IsValid() || endpoint.Port() == 0 || pathScope(endpoint.Addr()) == 0 {
			return
		}
		if _, exists := seen[endpoint]; exists {
			return
		}
		seen[endpoint] = struct{}{}
		result = append(result, endpoint)
	}
	if n.directPaths != nil {
		for _, endpoint := range n.directPaths() {
			appendCandidate(endpoint)
		}
	}
	for _, surface := range n.surfaces {
		appendCandidate(surface.endpoint)
	}
	return result
}

// sendPathProbeLocked sends a normal probe to one peer endpoint. Callers that
// obtained endpoint from an unauthenticated source must validate it first.
func (n *Node) sendPathProbeLocked(peer *peer, localSocket int64, endpoint netip.AddrPort, now time.Time, requestedPriority ...int) error {
	_, err := n.sendPathProbeForNetworkModeLocked(peer, localSocket, endpoint, 0, now, false, requestedPriority...)
	return err
}

// sendClusterRedirectProbeLocked probes an endpoint learned from a cluster
// redirect.
func (n *Node) sendClusterRedirectProbeLocked(peer *peer, localSocket int64, endpoint netip.AddrPort, now time.Time, requestedPriority int) error {
	_, err := n.sendPathProbeForNetworkModeLocked(peer, localSocket, endpoint, 0, now, true, requestedPriority)
	return err
}

// sendPathProbeForNetworkModeLocked selects full HELLO or lightweight ECHO
// probing with optional network context. Its boolean result reports whether a
// probe was sent rather than suppressed by the duplicate-probe window.
func (n *Node) sendPathProbeForNetworkModeLocked(peer *peer, localSocket int64, endpoint netip.AddrPort, networkID uint64, now time.Time, fullHello bool, requestedPriority ...int) (bool, error) {
	for key, probedAt := range peer.pathProbe {
		if now.Sub(probedAt) > peerPathProbeWindow {
			delete(peer.pathProbe, key)
		}
	}
	key := pathKey{localSocket: localSocket, endpoint: endpoint}
	if lastProbe := peer.pathProbe[key]; !lastProbe.IsZero() && now.Sub(lastProbe) <= peerPathProbeWindow {
		return false, nil
	}
	if _, exists := peer.pathProbe[key]; !exists && len(peer.pathProbe) >= maxPeerPaths {
		return false, errors.New("too many pending ZeroTier path probes")
	}
	priority := 1
	if len(requestedPriority) != 0 && requestedPriority[0] > priority {
		priority = requestedPriority[0]
	}
	peer.pathProbe[key] = now
	if fullHello || peer.protocol < 5 || (peer.major == 1 && peer.minor == 1 && peer.revision == 0) {
		if err := n.sendHelloAtPathWithPriorityAndNetworkLocked(peer.identity.Address(), key, now, priority, networkID); err != nil {
			delete(peer.pathProbe, key)
			return false, err
		}
		return true, nil
	}
	packet, err := NewPacket(peer.identity.Address(), n.identity.Address(), VerbEcho)
	if err != nil {
		delete(peer.pathProbe, key)
		return false, err
	}
	if err := n.addPendingLocked(packet.PacketID(), pendingRequest{verb: VerbEcho, peer: peer.identity.Address(), networkID: networkID, sentAt: now, path: key, priority: priority}); err != nil {
		delete(peer.pathProbe, key)
		return false, err
	}
	if err := n.sendPacketViaPathLocked(peer, packet, true, key, false); err != nil {
		n.deletePendingLocked(packet.PacketID())
		delete(peer.pathProbe, key)
		return false, err
	}
	return true, nil
}

// evictOldestPathLocked removes the least recently active physical path for
// peer, matching the official core's Path::age replacement rule. It reports
// false when no path has positive age and therefore no replacement slot is
// available.
func (n *Node) evictOldestPathLocked(peer *peer, now time.Time) bool {
	var oldestKey pathKey
	var oldestAge time.Duration
	for key, path := range peer.paths {
		age := wirePathAge(path, now)
		if age > 0 && (!oldestKey.endpoint.IsValid() || age > oldestAge || age == oldestAge && pathKeyLess(key, oldestKey)) {
			oldestAge = age
			oldestKey = key
		}
	}
	if oldestKey.endpoint.IsValid() {
		n.deletePeerPathLocked(peer, oldestKey)
		return true
	}
	return false
}

// updatePathLatencyLocked applies a HELLO's echoed wire timestamp to the path
// that actually returned the response. The response may use a different port
// than the request target.
func (n *Node) updatePathLatencyLocked(peer *peer, localSocket int64, remote netip.AddrPort, sentAtMillis uint64, now time.Time) {
	key := pathKey{localSocket: localSocket, endpoint: remote}
	nowMillis := now.UnixMilli()
	if nowMillis < 0 || sentAtMillis > uint64(nowMillis) {
		return
	}
	path := peer.paths[key]
	if path == nil {
		return
	}
	latencyMilliseconds := uint64(nowMillis) - sentAtMillis
	if latencyMilliseconds > uint64((time.Duration(1<<63-1))/time.Millisecond) {
		return
	}
	previousMilliseconds := path.latency / time.Millisecond
	if (!path.latencyMeasured && path.latency <= 0) || previousMilliseconds >= 0xffff {
		path.latency = time.Duration(latencyMilliseconds) * time.Millisecond
	} else {
		path.latency = (previousMilliseconds + time.Duration(latencyMilliseconds)) / 2 * time.Millisecond
	}
	path.latencyMeasured = true
}

// reassembleWirePacket accepts a packet or fragment and returns complete wire
// data. Incomplete assemblies never acquire the protocol-state lock.
func (n *Node) reassembleWirePacket(localSocket int64, remote netip.AddrPort, data []byte, now time.Time) (receivedWirePacket, bool, error) {
	select {
	case <-n.done:
		return receivedWirePacket{}, false, ErrNodeClosed
	default:
	}
	n.noteWirePathReceive(pathKey{localSocket: localSocket, endpoint: remote}, now)
	if len(data) > MaxPacketSize {
		return receivedWirePacket{}, false, ErrInvalidPacket
	}
	if len(data) > FragmentHeaderSize && data[13] == 0xff {
		destination, err := AddressFromBytes(data[8:13])
		if err != nil || destination != n.identity.Address() {
			return receivedWirePacket{}, false, ErrInvalidPacket
		}
		packetID := binary.BigEndian.Uint64(data[:8])
		total, number := int(data[14]>>4), int(data[14]&0x0f)
		if total < 2 || total > 7 || number < 1 || number >= total {
			return receivedWirePacket{}, false, ErrInvalidPacket
		}
		n.fragmentMu.Lock()
		defer n.fragmentMu.Unlock()
		select {
		case <-n.done:
			return receivedWirePacket{}, false, ErrNodeClosed
		default:
		}
		assembly := n.fragments[packetID]
		if assembly == nil {
			assembly = n.newFragmentAssemblyLocked(packetID, now)
		} else if assembly.total != 0 && assembly.total != total {
			return receivedWirePacket{}, false, ErrInvalidPacket
		}
		if assembly.fragments[number] != nil {
			return receivedWirePacket{}, false, nil
		}
		assembly.total = total
		if packet, complete, err := n.finishAssemblyLocked(packetID, assembly, number, data[FragmentHeaderSize:], 0, netip.AddrPort{}); complete || err != nil {
			return packet, complete, err
		}
		if !assembly.storeFragment(number, data[FragmentHeaderSize:]) {
			n.removeFragmentAssemblyLocked(packetID, assembly)
			return receivedWirePacket{}, false, ErrInvalidPacket
		}
		return receivedWirePacket{}, false, nil
	}
	if len(data) < PacketMinSize {
		return receivedWirePacket{}, false, ErrInvalidPacket
	}
	if data[PacketFlagsOffset]&FlagFragmented == 0 {
		return receivedWirePacket{localSocket: localSocket, remote: remote, data: append([]byte(nil), data...), receivedAt: now}, true, nil
	}
	destination, destinationErr := AddressFromBytes(data[PacketDestOffset:PacketSourceOffset])
	source, sourceErr := AddressFromBytes(data[PacketSourceOffset:PacketFlagsOffset])
	if destinationErr != nil || sourceErr != nil || destination != n.identity.Address() || source == n.identity.Address() {
		return receivedWirePacket{}, false, ErrInvalidPacket
	}
	n.fragmentMu.Lock()
	defer n.fragmentMu.Unlock()
	select {
	case <-n.done:
		return receivedWirePacket{}, false, ErrNodeClosed
	default:
	}
	packetID := binary.BigEndian.Uint64(data[:8])
	assembly := n.fragments[packetID]
	if assembly == nil {
		assembly = n.newFragmentAssemblyLocked(packetID, now)
	} else if len(assembly.head) != 0 {
		return receivedWirePacket{}, false, nil
	}
	assembly.localSocket, assembly.remote = localSocket, remote
	assembly.headReceivedAt = now
	if packet, complete, err := n.finishAssemblyLocked(packetID, assembly, 0, data, localSocket, remote); complete || err != nil {
		return packet, complete, err
	}
	if !assembly.storeFragment(0, data) {
		n.removeFragmentAssemblyLocked(packetID, assembly)
		return receivedWirePacket{}, false, ErrInvalidPacket
	}
	return receivedWirePacket{}, false, nil
}

// storeFragment copies one incomplete wire piece into the assembly's reusable
// slot storage. Pieces retain their arrival order in storage; finishAssemblyLocked
// emits them in protocol fragment order.
func (assembly *fragmentAssembly) storeFragment(number int, data []byte) bool {
	if number < 0 || number >= len(assembly.fragments) || len(data) > len(assembly.storage)-assembly.used {
		return false
	}
	stored := assembly.storage[assembly.used : assembly.used+len(data)]
	copy(stored, data)
	assembly.used += len(data)
	if number == 0 {
		assembly.head = stored
	} else {
		assembly.fragments[number] = stored
	}
	return true
}

// newFragmentAssemblyLocked reuses one of the official-size fixed reassembly
// slots for packetID.
func (n *Node) newFragmentAssemblyLocked(packetID uint64, now time.Time) *fragmentAssembly {
	slot := n.fragmentSlotCursor
	n.fragmentSlotCursor = (n.fragmentSlotCursor + 1) % maxFragmentAssemblies
	assembly := n.fragmentSlots[slot]
	if assembly == nil {
		assembly = new(fragmentAssembly)
		n.fragmentSlots[slot] = assembly
	} else if assembly.active {
		previous := assembly
		n.removeFragmentAssemblyLocked(previous.packetID, previous)
	}
	assembly.active = true
	assembly.packetID = packetID
	assembly.slot = slot
	assembly.used = 0
	assembly.head = nil
	for index := range assembly.fragments {
		assembly.fragments[index] = nil
	}
	assembly.total = 0
	assembly.localSocket = 0
	assembly.remote = netip.AddrPort{}
	assembly.createdAt = now
	assembly.headReceivedAt = time.Time{}
	n.fragments[packetID] = assembly
	return assembly
}

// removeFragmentAssemblyLocked deactivates and clears assembly only when it is
// still current. Its fixed slot remains allocated for the next packet.
func (n *Node) removeFragmentAssemblyLocked(packetID uint64, assembly *fragmentAssembly) {
	if n.fragments[packetID] == assembly {
		delete(n.fragments, packetID)
	}
	if assembly != nil && assembly.slot >= 0 && assembly.slot < len(n.fragmentSlots) && n.fragmentSlots[assembly.slot] == assembly {
		assembly.active = false
		assembly.used = 0
		assembly.head = nil
		for index := range assembly.fragments {
			assembly.fragments[index] = nil
		}
		assembly.total = 0
		assembly.localSocket = 0
		assembly.remote = netip.AddrPort{}
		assembly.createdAt = time.Time{}
		assembly.headReceivedAt = time.Time{}
	}
}

// pendingIncomingCountLocked returns packets deferred for identity discovery.
func (n *Node) pendingIncomingCountLocked() int {
	count := 0
	for _, packets := range n.pendingIncoming {
		count += len(packets)
	}
	return count
}

// enqueuePendingIncomingLocked queues one bounded, core-owned inbound packet
// for address. Authenticated packets retain their decoded state, matching the
// official core's IncomingPacket retry behavior.
func (n *Node) enqueuePendingIncomingLocked(address Address, packet receivedWirePacket, now time.Time) bool {
	packets := n.pendingIncoming[address]
	if len(packet.data) >= 8 {
		packetID := binary.BigEndian.Uint64(packet.data[:8])
		for _, pending := range packets {
			if len(pending.data) >= 8 && binary.BigEndian.Uint64(pending.data[:8]) == packetID {
				return false
			}
		}
	}
	if n.pendingIncomingCountLocked() >= maxPendingIncomingPackets {
		return false
	}
	packet.lastTried = now
	n.pendingIncoming[address] = append(packets, packet)
	return true
}

// addPendingLocked records an outbound request under packetID. The fixed ring
// bounds memory and replaces one earlier expectation in O(1) at capacity.
func (n *Node) addPendingLocked(packetID uint64, request pendingRequest) error {
	if _, exists := n.pending[packetID]; exists {
		return errors.New("duplicate ZeroTier packet ID")
	}
	slotIndex := n.pendingSlotCursor
	n.pendingSlotCursor++
	if n.pendingSlotCursor == len(n.pendingSlots) {
		n.pendingSlotCursor = 0
	}
	slot := &n.pendingSlots[slotIndex]
	if slot.generation != 0 {
		if existing, exists := n.pending[slot.packetID]; exists && existing.slot == slotIndex && existing.generation == slot.generation {
			delete(n.pending, slot.packetID)
		}
	}
	n.pendingGeneration++
	if n.pendingGeneration == 0 {
		n.pendingGeneration++
	}
	request.slot = slotIndex
	request.generation = n.pendingGeneration
	*slot = pendingRequestSlot{packetID: packetID, generation: request.generation}
	n.pending[packetID] = request
	return nil
}

// deletePendingLocked removes packetID and clears its ring slot if it still
// owns that slot.
func (n *Node) deletePendingLocked(packetID uint64) {
	request, exists := n.pending[packetID]
	if !exists {
		return
	}
	delete(n.pending, packetID)
	if request.generation == 0 || request.slot < 0 || request.slot >= len(n.pendingSlots) {
		return
	}
	slot := &n.pendingSlots[request.slot]
	if slot.packetID == packetID && slot.generation == request.generation {
		*slot = pendingRequestSlot{}
	}
}

// allowIdentityValidationLocked enforces per-source proof validation limits.
func (n *Node) allowIdentityValidationLocked(address netip.Addr, now time.Time) bool {
	bucket := identityValidationBucket(address)
	if checkedAt := n.identityChecks[bucket]; !checkedAt.IsZero() && now.Sub(checkedAt) < identityValidationRateLimit(runtime.GOARCH) {
		return false
	}
	n.identityChecks[bucket] = now
	return true
}

// identityValidationRateLimit selects the per-source proof validation interval
// for an architecture.
func identityValidationRateLimit(goarch string) time.Duration {
	switch goarch {
	case "amd64":
		return 2 * time.Second
	case "386":
		return 5 * time.Second
	default:
		return 10 * time.Second
	}
}

// identityValidationBucket maps a source IP into the validation limiter table.
func identityValidationBucket(address netip.Addr) uint16 {
	address = address.Unmap()
	if address.Is4() {
		raw := address.As4()
		hash := uint32(raw[0])<<16 | uint32(raw[1])<<8 | uint32(raw[2])
		hash ^= hash >> 14
		return uint16(hash & (identityValidationBuckets - 1))
	}
	if address.Is6() {
		raw := address.As16()
		var hash uint32
		for _, value := range raw[:6] {
			hash = hash<<1 + uint32(value)
		}
		return uint16(hash & (identityValidationBuckets - 1))
	}
	return 0
}

// finishAssemblyLocked joins an assembly when current supplies its last missing
// part. currentNumber is zero for the packet head and otherwise a fragment
// number. The current receive buffer is copied directly into the result.
func (n *Node) finishAssemblyLocked(packetID uint64, assembly *fragmentAssembly, currentNumber int, current []byte, localSocket int64, remote netip.AddrPort) (receivedWirePacket, bool, error) {
	if assembly.total < 2 {
		return receivedWirePacket{}, false, nil
	}
	head := assembly.head
	if currentNumber == 0 {
		head = current
	}
	if len(head) == 0 {
		return receivedWirePacket{}, false, nil
	}
	totalLength := len(head)
	for number := 1; number < assembly.total; number++ {
		fragment := assembly.fragments[number]
		if number == currentNumber {
			fragment = current
		}
		if len(fragment) == 0 {
			return receivedWirePacket{}, false, nil
		}
		if len(fragment) > MaxPacketSize-totalLength {
			n.removeFragmentAssemblyLocked(packetID, assembly)
			return receivedWirePacket{}, false, ErrInvalidPacket
		}
		totalLength += len(fragment)
	}
	data := make([]byte, totalLength)
	position := copy(data, head)
	for number := 1; number < assembly.total; number++ {
		fragment := assembly.fragments[number]
		if number == currentNumber {
			fragment = current
		}
		position += copy(data[position:], fragment)
	}
	if currentNumber != 0 {
		localSocket, remote = assembly.localSocket, assembly.remote
	}
	receivedAt := assembly.headReceivedAt
	n.removeFragmentAssemblyLocked(packetID, assembly)
	return receivedWirePacket{localSocket: localSocket, remote: remote, data: data, receivedAt: receivedAt}, true, nil
}

// requestWhoisLocked schedules bounded identity discovery for address.
func (n *Node) requestWhoisLocked(address Address, now time.Time) {
	if n.loadPeerCacheLocked(address, now) != nil {
		return
	}
	if requestedAt := n.pendingWhois[address]; !requestedAt.IsZero() && now.Sub(requestedAt) < whoisRetryPeriod {
		return
	}
	root, path := n.bestRootPeerPathLocked(now)
	if root == nil || !path.endpoint.IsValid() {
		return
	}
	packet, err := NewPacket(root.identity.Address(), n.identity.Address(), VerbWhois)
	if err != nil {
		return
	}
	addressBytes := address.Bytes()
	_ = packet.Append(addressBytes[:]...)
	if n.addPendingLocked(packet.PacketID(), pendingRequest{verb: VerbWhois, peer: root.identity.Address(), sentAt: now}) != nil {
		return
	}
	n.pendingWhois[address] = now
	if err := n.sendPacketViaPathLocked(root, packet, true, path, false); err != nil {
		n.deletePendingLocked(packet.PacketID())
		delete(n.pendingWhois, address)
	}
}

// retryPendingWhoisLocked sends due identity requests and retries queued work.
func (n *Node) retryPendingWhoisLocked(now time.Time) {
	requested := make(map[Address]struct{})
	add := func(address Address) {
		if address != n.identity.Address() && !address.IsReserved() {
			if _, known := n.peers[address]; known {
				return
			}
			requested[address] = struct{}{}
		}
	}
	for address := range n.pendingIncoming {
		add(address)
	}
	for address := range n.pendingFrames {
		add(address)
	}
	for address := range n.pendingUserMessages {
		add(address)
	}
	for address := range n.pendingRemoteTraces {
		add(address)
	}
	for _, transmit := range n.pendingTransmits {
		add(transmit.packet.Destination())
	}
	for address := range n.deferredCapabilities {
		add(address)
	}
	for address := range n.deferredCredentials {
		add(address)
	}
	for _, network := range n.networks {
		for group, pending := range network.pendingMulticast {
			for _, item := range pending {
				if item.targets != nil {
					for address := range item.targets {
						if _, sent := item.sent[address]; !sent {
							add(address)
						}
					}
					continue
				}
				for address, seen := range network.multicast[group] {
					if now.Sub(seen) >= multicastMemberExpiration {
						continue
					}
					if _, sent := item.sent[address]; !sent {
						add(address)
					}
				}
				for _, address := range network.Config.specialistAddresses(specialistTypeActiveBridge) {
					if _, sent := item.sent[address]; !sent {
						add(address)
					}
				}
			}
		}
	}
	for address := range requested {
		n.requestWhoisLocked(address, now)
	}
}

// hasPendingWhoisWorkLocked reports whether identity discovery remains queued.
func (n *Node) hasPendingWhoisWorkLocked() bool {
	if len(n.pendingIncoming) != 0 || len(n.pendingFrames) != 0 || len(n.pendingUserMessages) != 0 || len(n.pendingRemoteTraces) != 0 ||
		len(n.pendingTransmits) != 0 || len(n.deferredCapabilities) != 0 || len(n.deferredCredentials) != 0 {
		return true
	}
	for _, network := range n.networks {
		for _, pending := range network.pendingMulticast {
			if len(pending) != 0 {
				return true
			}
		}
	}
	return false
}

// requestNetworkConfigLocked chooses local ad-hoc setup or controller contact.
func (n *Node) requestNetworkConfigLocked(networkID uint64, now time.Time) error {
	if IsAdHocNetworkID(networkID) {
		return n.configureAdHocNetworkLocked(networkID, now)
	}
	controller := Controller(networkID)
	if controller == n.identity.Address() {
		if network := n.networks[networkID]; network != nil {
			n.setNetworkFailureLocked(network, NetworkStatusNotFound, NetworkAuthenticationInfo{}, EventNetworkNotFound)
		}
		return nil
	}
	if n.loadPeerCacheLocked(controller, now) == nil {
		n.requestWhoisLocked(controller, now)
		return nil
	}
	return n.sendNetworkConfigRequestLocked(networkID, now)
}

// sendNetworkConfigRequestLocked sends a request through the best root.
func (n *Node) sendNetworkConfigRequestLocked(networkID uint64, now time.Time) error {
	// Implemented in network_config.go alongside dictionary encoding.
	return n.sendNetworkConfigRequestPacketLocked(networkID, now)
}

// bestRootLocked returns the best root peer and endpoint currently available.
func (n *Node) bestRootLocked() (*peer, netip.AddrPort) {
	peer, path := n.bestRootPeerPathLocked(time.Now())
	return peer, path.endpoint
}

// bestRootPathLocked returns the best current path to any root.
func (n *Node) bestRootPathLocked(now time.Time) pathKey {
	_, path := n.bestRootPeerPathLocked(now)
	return path
}

// bestRootPeerPathLocked returns the root peer paired with its best path.
// A root without an authenticated path may still be returned so callers can
// select its identity, but its path is invalid. Static world endpoints are only
// valid for the root HELLO bootstrap performed by ProcessBackgroundTasks.
func (n *Node) bestRootPeerPathLocked(now time.Time) (*peer, pathKey) {
	var fallback *peer
	var selectedPeer *peer
	var selectedPath pathKey
	bestQuality := uint64(^uint32(0))
	for _, root := range n.allRootsLocked() {
		peer := n.peers[root.Identity.Address()]
		if peer == nil {
			continue
		}
		if fallback == nil {
			fallback = peer
		}
		path := n.bestDirectPeerPathLocked(peer, now)
		if !path.endpoint.IsValid() {
			continue
		}
		age := now.Sub(peer.lastReceive)
		quality := uint64(^uint32(0))
		if !peer.lastReceive.IsZero() && age >= 0 && age < learnedPeerExpiration {
			latencyMillis := uint64(pathLatency(peer.paths[path]) / time.Millisecond)
			missedPings := uint64(age/(peerFullHelloPeriod+time.Second)) + 1
			quality = latencyMillis * missedPings
			if quality > uint64(^uint32(0)) {
				quality = uint64(^uint32(0))
			}
		}
		if selectedPeer == nil || quality <= bestQuality {
			selectedPeer, selectedPath, bestQuality = peer, path, quality
		}
	}
	if selectedPeer != nil {
		return selectedPeer, selectedPath
	}
	return fallback, pathKey{}
}

// pathLatency returns a measured path latency or the unknown-latency sentinel.
func pathLatency(path *peerPathState) time.Duration {
	if path == nil || !path.latencyMeasured && path.latency <= 0 {
		return unknownPathLatency
	}
	return path.latency
}

// isRootAddressLocked reports whether address belongs to the active topology.
func (n *Node) isRootAddressLocked(address Address) bool {
	for _, root := range n.allRootsLocked() {
		if root.Identity.Address() == address {
			return true
		}
	}
	return false
}

// allRootsLocked returns planet and moon roots with duplicate identities removed.
func (n *Node) allRootsLocked() []WorldRoot {
	roots := make([]WorldRoot, 0, len(n.planet.Roots)+len(n.moons)*maxWorldRoots)
	roots = append(roots, n.planet.Roots...)
	moonIDs := make([]uint64, 0, len(n.moons))
	for id := range n.moons {
		moonIDs = append(moonIDs, id)
	}
	sort.Slice(moonIDs, func(i, j int) bool { return moonIDs[i] < moonIDs[j] })
	for _, id := range moonIDs {
		roots = append(roots, n.moons[id].Roots...)
	}
	return roots
}

// shouldAcceptWorldUpdateFromLocked validates a topology update sender.
func (n *Node) shouldAcceptWorldUpdateFromLocked(address Address) bool {
	if peer := n.peers[address]; peer != nil && peer.root {
		return true
	}
	for _, seed := range n.moonSeeds {
		if seed == address {
			return true
		}
	}
	return false
}

// addWorldLocked validates, orders, persists, and applies a planet or moon.
func (n *Node) addWorldLocked(world World, alwaysAcceptNew bool) error {
	if err := world.validateRoots(); err != nil {
		return err
	}
	switch world.Type {
	case WorldTypePlanet:
		if !n.planet.ShouldBeReplacedBy(world) {
			return ErrInvalidWorld
		}
		n.planet = world
		if data, err := world.Serialize(); err == nil {
			_ = n.store.Put(planetStateName(), data)
		}
	case WorldTypeMoon:
		current, exists := n.moons[world.ID]
		if exists {
			if !current.ShouldBeReplacedBy(world) {
				return ErrInvalidWorld
			}
		} else if !alwaysAcceptNew {
			seed, wanted := n.moonSeeds[world.ID]
			if !wanted || !worldHasRoot(world, seed) {
				return ErrInvalidWorld
			}
		}
		n.moons[world.ID] = world
		delete(n.moonSeeds, world.ID)
		if data, err := world.Serialize(); err == nil {
			_ = n.store.Put(moonStateName(world.ID), data)
		}
	default:
		return ErrInvalidWorld
	}
	n.refreshTopologyRootsLocked()
	return nil
}

// refreshTopologyRootsLocked reconciles active root peers with planet and moons.
func (n *Node) refreshTopologyRootsLocked() {
	for _, peer := range n.peers {
		peer.root = false
		peer.role = PeerRoleLeaf
	}
	for _, root := range n.allRootsLocked() {
		_ = n.addPeerLocked(root.Identity, true)
	}
}

// worldHasRoot reports whether world contains a root with address.
func worldHasRoot(world World, address Address) bool {
	for _, root := range world.Roots {
		if root.Identity.Address() == address {
			return true
		}
	}
	return false
}

// loadStoredWorld reads and fully validates one persisted world object.
func loadStoredWorld(store StateStore, name string) (World, error) {
	data, err := store.Get(name)
	if err != nil {
		return World{}, err
	}
	world, consumed, err := ParseWorld(data)
	if err != nil || consumed != len(data) {
		return World{}, ErrInvalidWorld
	}
	return world, nil
}

// planetStateName returns the official persistent planet object name.
func planetStateName() string { return "planet" }

// moonStateName returns the official persistent object name for a moon.
func moonStateName(worldID uint64) string { return fmt.Sprintf("moons.d/%016x.moon", worldID) }

// markRootReceiveLocked updates online state after traffic from an allowed root.
func (n *Node) markRootReceiveLocked(peer *peer, remote netip.AddrPort, now time.Time) {
	if !peer.root {
		return
	}
	n.lastRootReceive = now
	if !n.online {
		n.online = true
		n.emitLocked(Event{Type: EventNodeOnline, PeerAddress: peer.identity.Address(), PeerRole: peer.role, Endpoint: remote})
	}
}

// emitLocked queues an event callback for execution after releasing the lock.
func (n *Node) emitLocked(event Event) {
	if event.NodeAddress.IsZero() {
		event.NodeAddress = n.identity.Address()
	}
	if callback := n.onEvent; callback != nil {
		n.callbacks = append(n.callbacks, func() { callback(event) })
	}
}

// unlockAndRunCallbacks commits ordered state callbacks, releases the node
// lock, and directly invokes high-volume data callbacks. State callbacks use
// one dispatcher; data callbacks from other protocol operations bypass a
// dispatcher that is already running.
func (n *Node) unlockAndRunCallbacks() {
	callbacks := n.callbacks
	n.callbacks = nil
	firstDataCallback := n.dataCallback
	n.dataCallback = dataCallback{}
	dataCallbacks := n.dataCallbacks
	n.dataCallbacks = nil
	if len(callbacks) != 0 {
		n.callbackBatches = append(n.callbackBatches, callbacks)
	}
	startDispatcher := !n.callbackRunning && len(n.callbackBatches) != 0
	if startDispatcher {
		n.callbackRunning = true
	}
	n.mu.Unlock()
	if startDispatcher {
		n.dispatchCallbacks()
	}
	firstDataCallback.run()
	for _, callback := range dataCallbacks {
		callback.run()
	}
}

// queueDataCallbackLocked keeps the common single callback inline. Additional
// callbacks preserve their production order in an overflow slice.
func (n *Node) queueDataCallbackLocked(callback dataCallback) {
	if n.dataCallback.kind == 0 {
		n.dataCallback = callback
		return
	}
	n.dataCallbacks = append(n.dataCallbacks, callback)
}

// run invokes one data callback after the Node lock has been released.
func (callback dataCallback) run() {
	switch callback.kind {
	case dataCallbackFrame:
		callback.callback.(func(Frame))(Frame{
			NetworkID:   callback.id,
			Source:      MAC(callback.origin),
			Destination: MAC(callback.destination),
			EtherType:   callback.etherType,
			Payload:     callback.payload,
		})
	case dataCallbackUserMessage:
		callback.callback.(func(UserMessage))(UserMessage{Origin: Address(callback.origin), TypeID: callback.id, Data: callback.payload})
	case dataCallbackRemoteTrace:
		callback.callback.(func(RemoteTrace))(RemoteTrace{Origin: Address(callback.origin), Data: callback.text})
	}
}

// dispatchCallbacks drains ordered callback batches. Its deferred cleanup
// makes a callback panic or runtime.Goexit unable to poison the dispatcher.
// The terminating callback is not retried. Remaining callbacks stay ordered;
// a concurrently committed batch triggers an immediate ownership transfer,
// otherwise the next protocol operation resumes them.
func (n *Node) dispatchCallbacks() {
	var callbacks []func()
	nextCallback := 0
	finished := false
	defer func() {
		if finished {
			return
		}
		n.mu.Lock()
		queuedByAnotherOperation := len(n.callbackBatches) != 0
		if nextCallback < len(callbacks) {
			remaining := append([]func(){}, callbacks[nextCallback:]...)
			n.callbackBatches = append([][]func(){remaining}, n.callbackBatches...)
		}
		// A protocol operation that queued callbacks while this dispatcher was
		// running has already observed callbackRunning=true and cannot take over.
		// Transfer ownership here so a panic or runtime.Goexit cannot strand that
		// committed batch. With only this dispatcher's remaining callbacks, retain
		// the existing behavior and let the next protocol operation retry them.
		n.callbackRunning = queuedByAnotherOperation
		n.mu.Unlock()
		if queuedByAnotherOperation {
			go n.dispatchCallbacks()
		}
	}()
	for {
		n.mu.Lock()
		if len(n.callbackBatches) == 0 {
			n.callbackRunning = false
			finished = true
			n.mu.Unlock()
			return
		}
		callbacks = n.callbackBatches[0]
		n.callbackBatches[0] = nil
		n.callbackBatches = n.callbackBatches[1:]
		n.mu.Unlock()
		nextCallback = 0
		for nextCallback < len(callbacks) {
			callback := callbacks[nextCallback]
			nextCallback++
			callback()
		}
		callbacks = nil
	}
}

// runCallbacks invokes queued embedding callbacks without holding the node lock.
func (n *Node) runCallbacks() {
	callbacks := n.callbacks
	n.callbacks = nil
	for _, callback := range callbacks {
		callback()
	}
}
