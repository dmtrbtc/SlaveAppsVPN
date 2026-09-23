// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Package transport implements the physical socket policy used by an
// embedded ZeroTier leaf node. Dialing and interface discovery are injected by
// the embedding so proxy routing and platform policy remain outside the
// package.
package transport

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/netip"
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	zerotier "github.com/metacubex/zerotier-go"
	"github.com/metacubex/zerotier-go/tcpfallback"
)

const (
	// wireIdleTimeout closes an endpoint-specific UDP connection after silence.
	wireIdleTimeout = 5 * time.Minute
	// maxConnectedUDPSockets bounds endpoint-specific sockets used when shared
	// UDP is unavailable, including when the embedding routes UDP through a
	// connection-oriented proxy implementation.
	maxConnectedUDPSockets = 1024
	// wireSocketRefreshPeriod controls offline socket-maintenance checks.
	wireSocketRefreshPeriod = 30 * time.Second
	// secondaryPortRotateAfter rotates an automatic secondary port after a
	// continuous offline interval.
	secondaryPortRotateAfter = 2 * time.Minute
	// udpDesiredBufferSize matches ZeroTier One's
	// ZT_UDP_DESIRED_BUF_SIZE. Large virtual-MTU frames are split across
	// physical datagrams, so a small host default can manufacture heavy loss
	// before the protocol core sees a burst.
	udpDesiredBufferSize = 1024 * 1024

	// DefaultTCPFallbackRelay is the public relay operated by ZeroTier.
	DefaultTCPFallbackRelay = tcpfallback.DefaultRelay
)

var (
	// errWireSocketBindSuperseded reports a bind completed after its port slot
	// moved to a newer generation.
	errWireSocketBindSuperseded = errors.New("ZeroTier UDP socket bind was superseded by a port change")

	// ErrClosed reports an operation on a closed physical transport.
	ErrClosed = errors.New("ZeroTier physical transport is closed")

	// ErrNotStarted reports an operation before Start installs a Node.
	ErrNotStarted = errors.New("ZeroTier physical transport is not started")

	// ErrTCPFallbackUnavailable reports a forced fallback send without an
	// established relay connection.
	ErrTCPFallbackUnavailable = errors.New("ZeroTier TCP fallback is not connected")
)

// Dialer supplies the physical TCP and UDP operations required by Transport.
// Implementations may apply proxy, interface, or routing-mark policy. Methods
// must stop promptly when ctx is canceled.
type Dialer interface {
	DialContext(ctx context.Context, network, address string) (net.Conn, error)
	ListenPacket(ctx context.Context, network, address string, remote netip.AddrPort) (net.PacketConn, error)
}

// udpSocketReadBufferSetter is implemented by sockets that allow the
// transport to request a larger receive buffer.
type udpSocketReadBufferSetter interface {
	SetReadBuffer(bytes int) error
}

// udpSocketWriteBufferSetter is implemented by sockets that allow the
// transport to request a larger send buffer.
type udpSocketWriteBufferSetter interface {
	SetWriteBuffer(bytes int) error
}

// NetDialer performs physical network operations through the Go standard
// library. Embeddings that need proxy or interface policy should implement
// Dialer instead.
type NetDialer struct{}

// DialContext opens a physical connection with the standard library dialer.
func (NetDialer) DialContext(ctx context.Context, network, address string) (net.Conn, error) {
	return (&net.Dialer{}).DialContext(ctx, network, address)
}

// ListenPacket opens a physical packet socket with the standard library.
func (NetDialer) ListenPacket(ctx context.Context, network, address string, _ netip.AddrPort) (net.PacketConn, error) {
	return (&net.ListenConfig{}).ListenPacket(ctx, network, address)
}

// Interface is the host-interface information needed to advertise direct
// physical paths.
type Interface struct {
	Name      string
	Flags     net.Flags
	Addresses []netip.Prefix
}

// InterfaceProvider returns a current snapshot of host interfaces.
type InterfaceProvider func() ([]Interface, error)

// LogLevel classifies an optional transport log message.
type LogLevel uint8

const (
	// LogDebug identifies recoverable transport diagnostics.
	LogDebug LogLevel = iota
	// LogInfo identifies transport state changes useful to operators.
	LogInfo
)

// String returns the stable diagnostic name of l.
func (l LogLevel) String() string {
	switch l {
	case LogDebug:
		return "debug"
	case LogInfo:
		return "info"
	default:
		return fmt.Sprintf("log-level(%d)", uint8(l))
	}
}

// MarshalText returns the stable diagnostic name of l for text-based encoders.
func (l LogLevel) MarshalText() ([]byte, error) {
	return []byte(l.String()), nil
}

// UnmarshalText parses the stable diagnostic name of a transport log level.
func (l *LogLevel) UnmarshalText(text []byte) error {
	var value LogLevel
	switch string(text) {
	case "debug":
		value = LogDebug
	case "info":
		value = LogInfo
	default:
		return fmt.Errorf("invalid ZeroTier transport log level %q", text)
	}
	*l = value
	return nil
}

// LogFunc receives diagnostic transport messages. Implementations should not
// block packet processing.
type LogFunc func(level LogLevel, format string, arguments ...interface{})

// TCPFallbackMode controls use of the public TCP relay.
type TCPFallbackMode uint8

const (
	// TCPFallbackAuto retains UDP while engaging TCP after direct failure.
	TCPFallbackAuto TCPFallbackMode = iota
	// TCPFallbackForce suppresses UDP and requires the configured TCP relay.
	TCPFallbackForce
	// TCPFallbackDisabled never opens or sends through a TCP relay.
	TCPFallbackDisabled
)

// ParseTCPFallbackMode parses the embedding-facing fallback mode. An empty
// value selects automatic fail-forward behavior.
func ParseTCPFallbackMode(value string) (TCPFallbackMode, error) {
	switch value {
	case "", "auto":
		return TCPFallbackAuto, nil
	case "force":
		return TCPFallbackForce, nil
	case "disable":
		return TCPFallbackDisabled, nil
	default:
		return 0, fmt.Errorf("invalid ZeroTier TCP fallback mode %q; expected auto, force, or disable", value)
	}
}

// String returns the embedding-facing name of m.
func (m TCPFallbackMode) String() string {
	switch m {
	case TCPFallbackAuto:
		return "auto"
	case TCPFallbackForce:
		return "force"
	case TCPFallbackDisabled:
		return "disable"
	default:
		return fmt.Sprintf("unknown(%d)", uint8(m))
	}
}

// MarshalText returns the embedding-facing name of m for text-based encoders.
func (m TCPFallbackMode) MarshalText() ([]byte, error) {
	return []byte(m.String()), nil
}

// UnmarshalText parses an embedding-facing TCP fallback mode.
func (m *TCPFallbackMode) UnmarshalText(text []byte) error {
	value, err := ParseTCPFallbackMode(string(text))
	if err != nil {
		return err
	}
	*m = value
	return nil
}

// Config configures one Node's physical transport.
type Config struct {
	Dialer           Dialer
	Interfaces       InterfaceProvider
	InterfaceName    string
	SharedUDP        bool
	RequireSharedUDP bool
	PrimaryPort      int
	SecondaryPort    int
	TCPFallbackMode  TCPFallbackMode
	TCPFallbackRelay string
	Log              LogFunc
}

// wirePortSlot identifies a shared configured or selected UDP port.
type wirePortSlot uint8

const (
	// wirePortPrimary selects the primary UDP port.
	wirePortPrimary wirePortSlot = iota
	// wirePortSecondary selects the secondary UDP port.
	wirePortSecondary
	// wirePortSlotCount is the number of indexed UDP port slots.
	wirePortSlotCount
)

// wireIPFamily identifies the network family used by a wire socket.
type wireIPFamily uint8

const (
	// wireIPv4 selects an IPv4 wire socket.
	wireIPv4 wireIPFamily = iota
	// wireIPv6 selects an IPv6 wire socket.
	wireIPv6
)

// wireSocketID is the stable local-socket handle exposed to the protocol core.
type wireSocketID int64

const (
	// wireSocketPrimaryIPv4 identifies the primary IPv4 wire socket.
	wireSocketPrimaryIPv4 wireSocketID = iota
	// wireSocketPrimaryIPv6 identifies the primary IPv6 wire socket.
	wireSocketPrimaryIPv6
	// wireSocketSecondaryIPv4 identifies the secondary IPv4 wire socket.
	wireSocketSecondaryIPv4
	// wireSocketSecondaryIPv6 identifies the secondary IPv6 wire socket.
	wireSocketSecondaryIPv6
)

// wireSocketSpec maps one stable socket ID to a port slot and IP family.
type wireSocketSpec struct {
	id       wireSocketID
	name     string
	portSlot wirePortSlot
	family   wireIPFamily
}

// wireSocketSpecs maps stable protocol-core socket handles to physical sockets.
var wireSocketSpecs = [...]wireSocketSpec{
	{id: wireSocketPrimaryIPv4, name: "primary IPv4", portSlot: wirePortPrimary, family: wireIPv4},
	{id: wireSocketPrimaryIPv6, name: "primary IPv6", portSlot: wirePortPrimary, family: wireIPv6},
	{id: wireSocketSecondaryIPv4, name: "secondary IPv4", portSlot: wirePortSecondary, family: wireIPv4},
	{id: wireSocketSecondaryIPv6, name: "secondary IPv6", portSlot: wirePortSecondary, family: wireIPv6},
}

// wireSocketSpecForID returns the physical socket specification for id.
func wireSocketSpecForID(id wireSocketID) (wireSocketSpec, bool) {
	for _, spec := range wireSocketSpecs {
		if spec.id == id {
			return spec, true
		}
	}
	return wireSocketSpec{}, false
}

// wireSocketIDFromHandle validates and converts a protocol-core socket handle.
func wireSocketIDFromHandle(handle int64) (wireSocketID, bool) {
	id := wireSocketID(handle)
	_, ok := wireSocketSpecForID(id)
	return id, ok
}

// String returns the diagnostic name of id.
func (id wireSocketID) String() string {
	if spec, ok := wireSocketSpecForID(id); ok {
		return spec.name
	}
	return fmt.Sprintf("unknown(%d)", int64(id))
}

// enabled reports whether spec is active under the secondary-port setting.
func (spec wireSocketSpec) enabled(secondaryUDP bool) bool {
	return spec.portSlot != wirePortSecondary || secondaryUDP
}

// matches reports whether spec can send to address's IP family.
func (spec wireSocketSpec) matches(address netip.Addr) bool {
	return (spec.family == wireIPv6) == address.Is6()
}

// listenAddress returns the packet network and wildcard host for the family.
func (family wireIPFamily) listenAddress() (network, host string) {
	if family == wireIPv6 {
		return "udp6", "::"
	}
	return "udp4", "0.0.0.0"
}

// connectedUDPSocket records the activity needed to evict the least recently
// used endpoint-specific socket when the bounded cache is full.
type connectedUDPSocket struct {
	connection net.Conn
	lastUsed   time.Time
}

// Transport owns the physical sockets and fail-forward state for one Node.
// A Transport cannot be restarted or attached to another Node after Close.
type Transport struct {
	config       Config
	secondaryUDP bool
	ports        [wirePortSlotCount]uint16
	// portGeneration prevents a bind started before an automatic port change
	// from installing into the new slot, including when the numeric port repeats.
	portGeneration [wirePortSlotCount]uint64
	policy         tcpfallback.Policy

	mu              sync.Mutex
	ctx             context.Context
	cancel          context.CancelFunc
	node            *zerotier.Node
	started         bool
	closed          bool
	connections     map[netip.AddrPort]connectedUDPSocket
	packetSockets   map[wireSocketID]net.PacketConn
	openingSockets  map[wireSocketID]struct{}
	fallback        *tcpfallback.Session
	fallbackOpening bool
	// Workers are added while mu proves the transport active. Close first marks
	// it closed under mu, so no Add can race the subsequent Wait.
	nodeWorkers sync.WaitGroup
}

// ValidateConfig reports whether config can create a physical transport.
func ValidateConfig(config Config) error {
	_, _, err := normalizeConfig(config)
	return err
}

// New validates config and creates an inactive physical transport.
func New(config Config) (*Transport, error) {
	config, secondaryUDP, err := normalizeConfig(config)
	if err != nil {
		return nil, err
	}
	var secondaryPort uint16
	if secondaryUDP {
		secondaryPort = uint16(config.SecondaryPort)
	}
	return &Transport{
		config:         config,
		secondaryUDP:   secondaryUDP,
		ports:          [wirePortSlotCount]uint16{uint16(config.PrimaryPort), secondaryPort},
		policy:         tcpfallback.NewPolicy(config.TCPFallbackMode == TCPFallbackForce),
		connections:    make(map[netip.AddrPort]connectedUDPSocket),
		packetSockets:  make(map[wireSocketID]net.PacketConn),
		openingSockets: make(map[wireSocketID]struct{}),
	}, nil
}

// normalizeConfig applies transport defaults and validates port combinations.
func normalizeConfig(config Config) (Config, bool, error) {
	if config.Dialer == nil {
		return Config{}, false, errors.New("nil ZeroTier physical transport dialer")
	}
	if config.RequireSharedUDP && !config.SharedUDP {
		return Config{}, false, errors.New("required ZeroTier shared UDP sockets are disabled")
	}
	if config.RequireSharedUDP && config.TCPFallbackMode == TCPFallbackForce {
		return Config{}, false, errors.New("required ZeroTier shared UDP sockets conflict with forced TCP fallback")
	}
	if config.PrimaryPort < 0 || config.PrimaryPort > 65535 {
		return Config{}, false, errors.New("ZeroTier primary port must be between 0 and 65535")
	}
	if config.SecondaryPort < -1 || config.SecondaryPort > 65535 {
		return Config{}, false, errors.New("ZeroTier secondary port must be between -1 and 65535")
	}
	secondaryUDP := config.SecondaryPort != -1
	if secondaryUDP && config.PrimaryPort != 0 && config.PrimaryPort == config.SecondaryPort {
		return Config{}, false, errors.New("ZeroTier primary and secondary ports must differ")
	}
	if config.TCPFallbackMode > TCPFallbackDisabled {
		return Config{}, false, errors.New("invalid ZeroTier TCP fallback mode")
	}
	if config.TCPFallbackRelay == "" {
		config.TCPFallbackRelay = tcpfallback.DefaultRelay
	}
	host, port, splitErr := net.SplitHostPort(config.TCPFallbackRelay)
	portNumber, portErr := strconv.ParseUint(port, 10, 16)
	if splitErr != nil || portErr != nil || host == "" || portNumber == 0 {
		if splitErr == nil {
			splitErr = errors.New("relay host and port must be non-zero")
		}
		return Config{}, false, fmt.Errorf("invalid ZeroTier TCP fallback relay: %w", splitErr)
	}
	return config, secondaryUDP, nil
}

// Start attaches node, opens configured shared sockets, and starts background
// maintenance. Unless RequireSharedUDP is set, failure to open all shared
// sockets is non-fatal because sends can use connected UDP while restoration
// continues in the background.
func (t *Transport) Start(ctx context.Context, node *zerotier.Node) error {
	if node == nil {
		return errors.New("nil ZeroTier node")
	}
	if ctx == nil {
		return errors.New("nil ZeroTier physical transport context")
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	t.mu.Lock()
	if t.closed {
		t.mu.Unlock()
		return ErrClosed
	}
	if t.started {
		t.mu.Unlock()
		return errors.New("ZeroTier physical transport is already started")
	}
	t.ctx, t.cancel = context.WithCancel(ctx)
	t.node = node
	t.started = true
	t.policy.Reset(time.Now())
	sharedUDP := t.config.SharedUDP && t.config.TCPFallbackMode != TCPFallbackForce
	t.mu.Unlock()
	if sharedUDP {
		if err := t.openPacketSockets(); err != nil {
			if t.config.RequireSharedUDP {
				t.log(LogDebug, "required shared UDP sockets are unavailable: %v", err)
				_ = t.Close()
				return err
			}
			t.log(LogDebug, "shared UDP sockets unavailable, using connected fallback: %v", err)
		}
		go t.runSocketMaintenance()
	}
	return nil
}

// Send implements zerotier.WireSender.
func (t *Transport) Send(localSocket int64, remote netip.AddrPort, packet []byte) error {
	fallbackSent, fallbackErr := t.sendTCPFallback(remote, packet, time.Now())
	if t.config.TCPFallbackMode == TCPFallbackForce {
		if fallbackErr == nil && !fallbackSent {
			return ErrTCPFallbackUnavailable
		}
		return fallbackErr
	}
	var socketStorage [len(wireSocketSpecs)]packetSocket
	sockets, err := t.packetSocketsForSend(localSocket, remote, socketStorage[:0])
	if err != nil {
		if fallbackSent && fallbackErr == nil {
			return nil
		}
		return err
	}
	if len(sockets) != 0 {
		var lastErr error
		var sent bool
		for _, socket := range sockets {
			written, writeErr := socket.connection.WriteTo(packet, net.UDPAddrFromAddrPort(remote))
			if writeErr == nil && written != len(packet) {
				writeErr = io.ErrShortWrite
			}
			if writeErr != nil {
				lastErr = writeErr
			} else {
				sent = true
			}
		}
		if sent {
			return nil
		}
		if fallbackSent && fallbackErr == nil {
			return nil
		}
		return lastErr
	}
	connection, err := t.connection(remote)
	if err != nil {
		if fallbackSent && fallbackErr == nil {
			return nil
		}
		return err
	}
	_ = connection.SetReadDeadline(time.Now().Add(wireIdleTimeout))
	_, err = connection.Write(packet)
	if err != nil {
		t.dropConnection(remote, connection)
	}
	if err != nil && fallbackSent && fallbackErr == nil {
		return nil
	}
	return err
}

// DirectPaths returns current local address and port pairs suitable for
// ZeroTier's authenticated path discovery.
func (t *Transport) DirectPaths() []netip.AddrPort {
	t.mu.Lock()
	sockets := make([]packetSocket, 0, len(t.packetSockets))
	for id, connection := range t.packetSockets {
		sockets = append(sockets, packetSocket{id: id, connection: connection})
	}
	provider := t.config.Interfaces
	interfaceName := t.config.InterfaceName
	t.mu.Unlock()

	v4Ports := make(map[uint16]struct{})
	v6Ports := make(map[uint16]struct{})
	paths := make([]netip.AddrPort, 0, len(sockets))
	for _, socket := range sockets {
		local, err := addrPortFromNetAddr(socket.connection.LocalAddr())
		if err != nil || local.Port() == 0 {
			continue
		}
		if local.Addr().IsUnspecified() {
			spec, ok := wireSocketSpecForID(socket.id)
			if !ok {
				continue
			}
			if spec.family == wireIPv6 {
				v6Ports[local.Port()] = struct{}{}
			} else {
				v4Ports[local.Port()] = struct{}{}
			}
		} else {
			paths = append(paths, local)
		}
	}
	if provider == nil {
		return paths
	}
	interfaces, err := provider()
	if err != nil {
		return paths
	}
	for _, networkInterface := range interfaces {
		if networkInterface.Flags&net.FlagUp == 0 || networkInterface.Flags&net.FlagLoopback != 0 {
			continue
		}
		if interfaceName != "" && networkInterface.Name != interfaceName {
			continue
		}
		if defaultInterfaceBlacklisted(runtime.GOOS, networkInterface.Name) {
			continue
		}
		for _, prefix := range networkInterface.Addresses {
			ip := prefix.Addr().Unmap()
			if !ip.IsValid() {
				continue
			}
			ports := v4Ports
			if ip.Is6() {
				ports = v6Ports
			}
			for port := range ports {
				paths = append(paths, netip.AddrPortFrom(ip, port))
			}
		}
	}
	return paths
}

// LocalAddresses reports the currently bound shared UDP addresses. It is
// intended for diagnostics; wildcard addresses are not expanded.
func (t *Transport) LocalAddresses() []netip.AddrPort {
	t.mu.Lock()
	connections := make([]net.PacketConn, 0, len(t.packetSockets))
	for _, connection := range t.packetSockets {
		connections = append(connections, connection)
	}
	t.mu.Unlock()
	addresses := make([]netip.AddrPort, 0, len(connections))
	for _, connection := range connections {
		if address, err := addrPortFromNetAddr(connection.LocalAddr()); err == nil {
			addresses = append(addresses, address)
		}
	}
	return addresses
}

// Close terminates all physical I/O owned by the transport. Call Wait after
// Close before closing or replacing the attached Node. Close itself does not
// wait, so it remains safe to invoke from a Node callback.
func (t *Transport) Close() error {
	t.mu.Lock()
	if t.closed {
		t.mu.Unlock()
		return nil
	}
	t.closed = true
	if t.cancel != nil {
		t.cancel()
	}
	packetSockets := make([]net.PacketConn, 0, len(t.packetSockets))
	for _, connection := range t.packetSockets {
		packetSockets = append(packetSockets, connection)
	}
	connections := make([]net.Conn, 0, len(t.connections))
	for _, socket := range t.connections {
		connections = append(connections, socket.connection)
	}
	fallback := t.fallback
	t.packetSockets = make(map[wireSocketID]net.PacketConn)
	t.connections = make(map[netip.AddrPort]connectedUDPSocket)
	t.openingSockets = make(map[wireSocketID]struct{})
	t.fallback = nil
	t.fallbackOpening = false
	t.node = nil
	t.policy.Reset(time.Time{})
	t.mu.Unlock()
	var closeErr error
	for _, connection := range packetSockets {
		closeErr = errors.Join(closeErr, connection.Close())
	}
	for _, connection := range connections {
		closeErr = errors.Join(closeErr, connection.Close())
	}
	if fallback != nil {
		closeErr = errors.Join(closeErr, fallback.Close())
	}
	return closeErr
}

// Wait blocks until every receive task that can call the attached Node has
// returned. The transport must be closed before Wait is called, and Wait must
// not be called from a Node callback running on this transport.
func (t *Transport) Wait() {
	t.nodeWorkers.Wait()
}

// openPacketSockets opens every enabled shared UDP socket, tolerating an
// unavailable address family when another succeeds.
func (t *Transport) openPacketSockets() error {
	var opened int
	var lastErr error
	for _, spec := range wireSocketSpecs {
		if !spec.enabled(t.secondaryUDP) {
			continue
		}
		if err := t.openPacketSocket(spec.id); err != nil {
			lastErr = err
			t.restorePacketSocket(spec.id)
			continue
		}
		opened++
	}
	if opened != 0 {
		return nil
	}
	if lastErr == nil {
		lastErr = errors.New("no UDP socket family is available")
	}
	return lastErr
}

// openPacketSocket binds one stable shared UDP socket and starts its reader.
func (t *Transport) openPacketSocket(id wireSocketID) error {
	spec, ok := wireSocketSpecForID(id)
	if !ok {
		return errors.New("invalid ZeroTier wire socket ID")
	}
	if !spec.enabled(t.secondaryUDP) {
		return fmt.Errorf("ZeroTier wire socket %s is disabled", id)
	}
	t.mu.Lock()
	if err := t.activeErrorLocked(); err != nil {
		t.mu.Unlock()
		return err
	}
	port := t.ports[spec.portSlot]
	portGeneration := t.portGeneration[spec.portSlot]
	ctx := t.ctx
	t.mu.Unlock()
	network, host := spec.family.listenAddress()
	address := net.JoinHostPort(host, strconv.Itoa(int(port)))
	connection, err := t.config.Dialer.ListenPacket(ctx, network, address, netip.AddrPort{})
	if err != nil {
		return err
	}
	t.configureUDPSocketBuffers(connection)
	local, err := addrPortFromNetAddr(connection.LocalAddr())
	if err != nil || local.Port() == 0 {
		_ = connection.Close()
		if err == nil {
			err = errors.New("ZeroTier UDP socket has no local port")
		}
		return err
	}
	t.mu.Lock()
	if err = t.activeErrorLocked(); err != nil {
		t.mu.Unlock()
		_ = connection.Close()
		return err
	}
	if t.portGeneration[spec.portSlot] != portGeneration || t.ports[spec.portSlot] != port {
		t.mu.Unlock()
		_ = connection.Close()
		return errWireSocketBindSuperseded
	}
	if t.ports[spec.portSlot] == 0 {
		t.ports[spec.portSlot] = local.Port()
		t.portGeneration[spec.portSlot]++
	} else if t.ports[spec.portSlot] != local.Port() {
		wanted := t.ports[spec.portSlot]
		t.mu.Unlock()
		_ = connection.Close()
		return fmt.Errorf("ZeroTier UDP socket bound port %d instead of %d", local.Port(), wanted)
	}
	if t.packetSockets[id] != nil {
		t.mu.Unlock()
		_ = connection.Close()
		return nil
	}
	node := t.node
	t.packetSockets[id] = connection
	t.nodeWorkers.Add(1)
	t.mu.Unlock()
	go func() {
		defer t.nodeWorkers.Done()
		t.readPacketSocket(id, connection, node)
	}()
	return nil
}

// restorePacketSocket asynchronously reopens a dropped shared UDP socket.
func (t *Transport) restorePacketSocket(id wireSocketID) {
	spec, ok := wireSocketSpecForID(id)
	if !ok || !t.config.SharedUDP || t.config.TCPFallbackMode == TCPFallbackForce || !spec.enabled(t.secondaryUDP) {
		return
	}
	t.mu.Lock()
	if t.activeErrorLocked() != nil || t.packetSockets[id] != nil {
		t.mu.Unlock()
		return
	}
	if _, opening := t.openingSockets[id]; opening {
		t.mu.Unlock()
		return
	}
	t.openingSockets[id] = struct{}{}
	ctx := t.ctx
	t.mu.Unlock()
	go func() {
		defer func() {
			t.mu.Lock()
			delete(t.openingSockets, id)
			t.mu.Unlock()
		}()
		delay := time.Second
		for ctx.Err() == nil {
			if err := t.openPacketSocket(id); err == nil {
				t.log(LogInfo, "restored shared UDP socket %s", id)
				return
			} else if errors.Is(err, errWireSocketBindSuperseded) {
				continue
			} else if errors.Is(err, ErrClosed) || errors.Is(err, ErrNotStarted) {
				return
			} else {
				t.log(LogDebug, "restore shared UDP socket %s: %v", id, err)
			}
			timer := time.NewTimer(delay)
			select {
			case <-timer.C:
			case <-ctx.Done():
				if !timer.Stop() {
					select {
					case <-timer.C:
					default:
					}
				}
				return
			}
			if delay < 30*time.Second {
				delay *= 2
				if delay > 30*time.Second {
					delay = 30 * time.Second
				}
			}
		}
	}()
}

// packetSocket pairs a stable wire socket ID with its active PacketConn.
type packetSocket struct {
	id         wireSocketID
	connection net.PacketConn
}

// packetSocketsForSend uses storage for the bounded selection result.
func (t *Transport) packetSocketsForSend(localSocket int64, remote netip.AddrPort, storage []packetSocket) ([]packetSocket, error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if err := t.activeErrorLocked(); err != nil {
		return nil, err
	}
	if id, ok := wireSocketIDFromHandle(localSocket); ok {
		spec, _ := wireSocketSpecForID(id)
		if connection := t.packetSockets[id]; connection != nil && spec.matches(remote.Addr()) {
			return append(storage, packetSocket{id: id, connection: connection}), nil
		}
	}
	for id, connection := range t.packetSockets {
		spec, ok := wireSocketSpecForID(id)
		if ok && spec.matches(remote.Addr()) {
			storage = append(storage, packetSocket{id: id, connection: connection})
		}
	}
	return storage, nil
}

// runSocketMaintenance rotates an automatic secondary port after prolonged
// offline state.
func (t *Transport) runSocketMaintenance() {
	ticker := time.NewTicker(wireSocketRefreshPeriod)
	defer ticker.Stop()
	offlineSince := time.Now()
	for {
		select {
		case now := <-ticker.C:
			t.mu.Lock()
			if t.activeErrorLocked() != nil {
				t.mu.Unlock()
				return
			}
			node := t.node
			rotate := t.secondaryUDP && t.config.SecondaryPort == 0
			t.mu.Unlock()
			if node.Online() {
				offlineSince = now
				continue
			}
			if rotate && now.Sub(offlineSince) >= secondaryPortRotateAfter {
				t.rotateSecondaryPort()
				offlineSince = now
			}
		case <-t.done():
			return
		}
	}
}

// rotateSecondaryPort closes and rebinds both secondary-family sockets.
func (t *Transport) rotateSecondaryPort() {
	t.mu.Lock()
	if t.activeErrorLocked() != nil {
		t.mu.Unlock()
		return
	}
	connections := make([]net.PacketConn, 0, 2)
	for _, spec := range wireSocketSpecs {
		if spec.portSlot == wirePortSecondary {
			if connection := t.packetSockets[spec.id]; connection != nil {
				connections = append(connections, connection)
			}
			delete(t.packetSockets, spec.id)
		}
	}
	t.ports[wirePortSecondary] = uint16(t.config.SecondaryPort)
	t.portGeneration[wirePortSecondary]++
	t.mu.Unlock()
	for _, connection := range connections {
		_ = connection.Close()
	}
	for _, spec := range wireSocketSpecs {
		if spec.portSlot != wirePortSecondary {
			continue
		}
		if err := t.openPacketSocket(spec.id); err != nil {
			t.log(LogDebug, "rotate secondary UDP socket %s: %v", spec.id, err)
			if !errors.Is(err, ErrClosed) {
				t.restorePacketSocket(spec.id)
			}
		}
	}
}

// readPacketSocket forwards datagrams from one shared socket to the protocol
// core.
func (t *Transport) readPacketSocket(id wireSocketID, connection net.PacketConn, node *zerotier.Node) {
	buffer := make([]byte, zerotier.MaxPacketSize)
	for {
		n, remoteAddress, err := connection.ReadFrom(buffer)
		if err != nil {
			t.mu.Lock()
			current := t.activeErrorLocked() == nil && t.node == node && t.packetSockets[id] == connection
			t.mu.Unlock()
			if netErr, ok := err.(net.Error); ok && (netErr.Timeout() || netErr.Temporary()) && current {
				continue
			}
			if removed := t.dropPacketSocket(id, connection); removed {
				if t.active() && !errors.Is(err, net.ErrClosed) && !errors.Is(err, os.ErrClosed) {
					t.log(LogDebug, "shared wire receive: %v", err)
				}
				t.restorePacketSocket(id)
			}
			return
		}
		remote, err := addrPortFromNetAddr(remoteAddress)
		if err != nil {
			t.log(LogDebug, "parse wire source %s: %v", remoteAddress, err)
			continue
		}
		if !t.currentNode(node) {
			t.dropPacketSocket(id, connection)
			return
		}
		now := time.Now()
		t.noteDirectGlobalReceive(remote, n, now)
		t.processWirePacket(node, int64(id), remote, buffer[:n], now)
	}
}

// dropPacketSocket removes and closes connection if it is still current for id.
func (t *Transport) dropPacketSocket(id wireSocketID, connection net.PacketConn) bool {
	t.mu.Lock()
	removed := t.packetSockets[id] == connection
	if removed {
		delete(t.packetSockets, id)
	}
	t.mu.Unlock()
	_ = connection.Close()
	return removed
}

// connection returns or creates an endpoint-specific connected UDP socket.
func (t *Transport) connection(remote netip.AddrPort) (net.Conn, error) {
	t.mu.Lock()
	if err := t.activeErrorLocked(); err != nil {
		t.mu.Unlock()
		return nil, err
	}
	if socket, ok := t.connections[remote]; ok {
		socket.lastUsed = time.Now()
		t.connections[remote] = socket
		t.mu.Unlock()
		return socket.connection, nil
	}
	ctx := t.ctx
	node := t.node
	t.mu.Unlock()
	connection, err := t.config.Dialer.DialContext(ctx, "udp", remote.String())
	if err != nil {
		return nil, err
	}
	t.configureUDPSocketBuffers(connection)
	t.mu.Lock()
	if err = t.activeErrorLocked(); err != nil || t.node != node {
		t.mu.Unlock()
		_ = connection.Close()
		if err == nil {
			err = ErrClosed
		}
		return nil, err
	}
	if existing, ok := t.connections[remote]; ok {
		t.mu.Unlock()
		_ = connection.Close()
		return existing.connection, nil
	}
	var evicted net.Conn
	if len(t.connections) >= maxConnectedUDPSockets {
		var oldestRemote netip.AddrPort
		var oldest time.Time
		for candidate, socket := range t.connections {
			if oldest.IsZero() || socket.lastUsed.Before(oldest) {
				oldestRemote, oldest = candidate, socket.lastUsed
			}
		}
		evicted = t.connections[oldestRemote].connection
		delete(t.connections, oldestRemote)
	}
	t.connections[remote] = connectedUDPSocket{connection: connection, lastUsed: time.Now()}
	t.nodeWorkers.Add(1)
	t.mu.Unlock()
	if evicted != nil {
		_ = evicted.Close()
	}
	_ = connection.SetReadDeadline(time.Now().Add(wireIdleTimeout))
	go func() {
		defer t.nodeWorkers.Done()
		t.readConnection(remote, connection, node)
	}()
	return connection, nil
}

// configureUDPSocketBuffers requests the same one-megabyte buffers as the
// official service. A custom dialer may not expose these optional methods,
// and an OS may clamp or reject the request, neither of which makes the
// socket unusable.
func (t *Transport) configureUDPSocketBuffers(connection interface{}) {
	if setter, ok := connection.(udpSocketReadBufferSetter); ok {
		if err := setter.SetReadBuffer(udpDesiredBufferSize); err != nil {
			t.log(LogDebug, "set UDP receive buffer: %v", err)
		}
	}
	if setter, ok := connection.(udpSocketWriteBufferSetter); ok {
		if err := setter.SetWriteBuffer(udpDesiredBufferSize); err != nil {
			t.log(LogDebug, "set UDP send buffer: %v", err)
		}
	}
}

// readConnection forwards connected UDP datagrams to the protocol core.
func (t *Transport) readConnection(remote netip.AddrPort, connection net.Conn, node *zerotier.Node) {
	buffer := make([]byte, zerotier.MaxPacketSize)
	for {
		n, err := connection.Read(buffer)
		if err != nil {
			removed := t.dropConnection(remote, connection)
			if removed && t.active() && !errors.Is(err, net.ErrClosed) && !errors.Is(err, os.ErrClosed) {
				t.log(LogDebug, "wire receive from %s: %v", remote, err)
			}
			return
		}
		now := time.Now()
		_ = connection.SetReadDeadline(now.Add(wireIdleTimeout))
		t.mu.Lock()
		socket, exists := t.connections[remote]
		current := t.activeErrorLocked() == nil && t.node == node && exists && socket.connection == connection
		if current {
			socket.lastUsed = now
			t.connections[remote] = socket
		}
		t.mu.Unlock()
		if !current {
			t.dropConnection(remote, connection)
			return
		}
		t.noteDirectGlobalReceive(remote, n, now)
		t.processWirePacket(node, zerotier.AnyLocalSocket, remote, buffer[:n], now)
	}
}

// dropConnection removes and closes connection if it is still current.
func (t *Transport) dropConnection(remote netip.AddrPort, connection net.Conn) bool {
	t.mu.Lock()
	removed := false
	if socket, ok := t.connections[remote]; ok && socket.connection == connection {
		delete(t.connections, remote)
		removed = true
	}
	t.mu.Unlock()
	_ = connection.Close()
	return removed
}

// sendTCPFallback updates relay policy and sends through an active session when
// required.
func (t *Transport) sendTCPFallback(remote netip.AddrPort, packet []byte, now time.Time) (bool, error) {
	if t.config.TCPFallbackMode == TCPFallbackDisabled || !tcpfallback.Eligible(remote, len(packet)) {
		return false, nil
	}
	t.mu.Lock()
	if err := t.activeErrorLocked(); err != nil {
		t.mu.Unlock()
		return false, err
	}
	decision := t.policy.ObserveSend(now)
	fallback := t.fallback
	if decision.Connect && fallback == nil && !t.fallbackOpening {
		t.fallbackOpening = true
		go t.openTCPFallback()
	}
	t.mu.Unlock()
	if !decision.Relay || fallback == nil {
		if decision.Relay && t.config.TCPFallbackMode == TCPFallbackForce {
			return false, ErrTCPFallbackUnavailable
		}
		return false, nil
	}
	return true, fallback.Send(remote, packet)
}

// openTCPFallback establishes and conditionally installs a relay session.
func (t *Transport) openTCPFallback() {
	t.mu.Lock()
	if err := t.activeErrorLocked(); err != nil {
		t.fallbackOpening = false
		t.mu.Unlock()
		return
	}
	ctx := t.ctx
	node := t.node
	relay := t.config.TCPFallbackRelay
	t.mu.Unlock()
	dialCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	connection, err := t.config.Dialer.DialContext(dialCtx, "tcp", relay)
	cancel()
	var fallback *tcpfallback.Session
	if err == nil {
		fallback, err = tcpfallback.NewSession(connection)
	}
	t.mu.Lock()
	candidate := t.activeErrorLocked() == nil && t.node == node && t.fallback == nil && t.policy.RelayRequired(time.Now())
	t.mu.Unlock()
	if fallback != nil && candidate {
		// Report the completed relay handshake before publishing the session. A
		// direct-recovery transition can therefore never overtake this message;
		// policy is checked again below in case direct UDP recovered while logging.
		t.log(LogInfo, "TCP fallback relay connection established to %s", relay)
	}
	t.mu.Lock()
	t.fallbackOpening = false
	stillNeeded := candidate && t.activeErrorLocked() == nil && t.node == node && t.fallback == nil && t.policy.RelayRequired(time.Now())
	if fallback != nil && stillNeeded {
		t.fallback = fallback
		t.nodeWorkers.Add(1)
		t.mu.Unlock()
		go func() {
			defer t.nodeWorkers.Done()
			t.runTCPFallback(fallback, node)
		}()
		return
	}
	t.mu.Unlock()
	if fallback != nil {
		_ = fallback.Close()
	} else if connection != nil {
		_ = connection.Close()
	}
	if err != nil && t.active() {
		t.log(LogDebug, "TCP fallback connection failed: %v", err)
	}
}

// runTCPFallback forwards relay records until the session terminates.
func (t *Transport) runTCPFallback(fallback *tcpfallback.Session, node *zerotier.Node) {
	err := fallback.Run(func(remote netip.AddrPort, packet []byte) error {
		t.mu.Lock()
		current := t.activeErrorLocked() == nil && t.node == node && t.fallback == fallback
		t.mu.Unlock()
		if !current {
			return ErrClosed
		}
		t.processWirePacket(node, zerotier.AnyLocalSocket, remote, packet, time.Now())
		return nil
	})
	t.dropTCPFallback(fallback, err)
}

// dropTCPFallback removes and closes a relay session and logs unexpected errors.
func (t *Transport) dropTCPFallback(fallback *tcpfallback.Session, err error) {
	t.mu.Lock()
	removed := t.fallback == fallback
	if removed {
		t.fallback = nil
	}
	active := removed && t.activeErrorLocked() == nil
	t.mu.Unlock()
	_ = fallback.Close()
	if err != nil && active && !errors.Is(err, ErrClosed) && !errors.Is(err, net.ErrClosed) && !errors.Is(err, os.ErrClosed) {
		t.log(LogDebug, "TCP fallback closed: %v", err)
	}
}

// noteDirectGlobalReceive records direct UDP recovery and closes automatic
// fallback.
func (t *Transport) noteDirectGlobalReceive(remote netip.AddrPort, packetLength int, now time.Time) {
	if !tcpfallback.DirectEvidence(remote, packetLength) {
		return
	}
	t.mu.Lock()
	if t.activeErrorLocked() != nil {
		t.mu.Unlock()
		return
	}
	t.policy.ObserveDirect(now)
	var fallback *tcpfallback.Session
	if t.config.TCPFallbackMode != TCPFallbackForce {
		fallback = t.fallback
		t.fallback = nil
	}
	t.mu.Unlock()
	if fallback != nil {
		_ = fallback.Close()
		t.log(LogInfo, "direct UDP recovered; TCP fallback closed")
	}
}

// processWirePacket forwards data to node while filtering expected rejection
// errors.
func (t *Transport) processWirePacket(node *zerotier.Node, localSocket int64, remote netip.AddrPort, packet []byte, now time.Time) {
	if err := node.ProcessWirePacket(localSocket, remote, packet, now); err != nil && !errors.Is(err, zerotier.ErrNodeClosed) && !errors.Is(err, zerotier.ErrUnknownPeer) && !errors.Is(err, zerotier.ErrInvalidPacket) {
		t.log(LogDebug, "process wire packet from %s: %v", remote, err)
	}
}

// activeErrorLocked reports whether the transport can currently perform I/O.
func (t *Transport) activeErrorLocked() error {
	if t.closed || (t.ctx != nil && t.ctx.Err() != nil) {
		return ErrClosed
	}
	if !t.started || t.node == nil {
		return ErrNotStarted
	}
	return nil
}

// active reports whether the transport is started and not closed.
func (t *Transport) active() bool {
	t.mu.Lock()
	active := t.activeErrorLocked() == nil
	t.mu.Unlock()
	return active
}

// currentNode reports whether node is still attached to an active transport.
func (t *Transport) currentNode(node *zerotier.Node) bool {
	t.mu.Lock()
	current := t.activeErrorLocked() == nil && t.node == node
	t.mu.Unlock()
	return current
}

// done returns the active context signal or an already-closed channel.
func (t *Transport) done() <-chan struct{} {
	t.mu.Lock()
	ctx := t.ctx
	t.mu.Unlock()
	if ctx == nil {
		closed := make(chan struct{})
		close(closed)
		return closed
	}
	return ctx.Done()
}

// log sends a formatted message to the optional embedding logger.
func (t *Transport) log(level LogLevel, format string, arguments ...interface{}) {
	if t.config.Log != nil {
		t.config.Log(level, format, arguments...)
	}
}

// addrPortFromNetAddr converts a network address to an unmapped netip endpoint.
func addrPortFromNetAddr(address net.Addr) (netip.AddrPort, error) {
	if address == nil {
		return netip.AddrPort{}, errors.New("nil network address")
	}
	if udpAddress, ok := address.(*net.UDPAddr); ok {
		address := udpAddress.AddrPort()
		return netip.AddrPortFrom(address.Addr().Unmap(), address.Port()), nil
	}
	return netip.ParseAddrPort(address.String())
}

// defaultInterfaceBlacklisted reports whether an interface should not be
// advertised as a direct physical path on goos.
func defaultInterfaceBlacklisted(goos, name string) bool {
	switch goos {
	case "linux":
		return strings.HasPrefix(name, "lo") || strings.HasPrefix(name, "zt") || strings.HasPrefix(name, "tun") || strings.HasPrefix(name, "tap")
	case "darwin":
		return strings.HasPrefix(name, "feth") || strings.HasPrefix(name, "lo") || strings.HasPrefix(name, "zt") ||
			strings.HasPrefix(name, "tun") || strings.HasPrefix(name, "tap") || strings.HasPrefix(name, "utun")
	case "freebsd":
		return strings.HasPrefix(name, "lo") || strings.HasPrefix(name, "zt")
	case "windows":
		return strings.HasPrefix(strings.ToLower(name), "zerotier")
	default:
		return false
	}
}
