// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

package tcpfallback

import (
	"errors"
	"net"
	"net/netip"
	"sync"
	"time"

	zerotier "github.com/metacubex/zerotier-go"
)

// ErrSessionClosed reports an operation on a closed fallback session.
var ErrSessionClosed = errors.New("ZeroTier TCP fallback session is closed")

// ErrSessionRunning reports a second Run call on the same session.
var ErrSessionRunning = errors.New("ZeroTier TCP fallback session is already running")

// ErrQueueFull reports that queuing a record would exceed MaxQueuedBytes.
var ErrQueueFull = errors.New("ZeroTier TCP fallback write queue is full")

const (
	// writeTimeout bounds each fallback relay record write.
	writeTimeout = 10 * time.Second
	// minPacketRecordSize is the shortest endpoint-bearing record accepted by
	// the official relay policy, including a non-head packet fragment.
	minPacketRecordSize = 12 + zerotier.FragmentHeaderSize + 1
)

// PacketHandler receives one decoded packet from a fallback relay. Returning
// an error terminates the session.
type PacketHandler func(netip.AddrPort, []byte) error

// Session owns the framing, bounded write queue, and read/write lifecycle of
// one established TCP fallback connection. Dialing and deciding when a
// session is needed remain embedding responsibilities.
type Session struct {
	connection net.Conn
	writes     chan []byte
	done       chan struct{}

	mu      sync.Mutex
	queued  int
	running bool
	closed  bool
	err     error
}

// NewSession sends the official client hello over connection and prepares a
// fallback session. Run must be called exactly once after the embedding has
// accepted the session as current.
func NewSession(connection net.Conn) (*Session, error) {
	if connection == nil {
		return nil, errors.New("nil ZeroTier TCP fallback connection")
	}
	_ = connection.SetWriteDeadline(time.Now().Add(writeTimeout))
	err := WriteRecord(connection, HelloRecord())
	_ = connection.SetWriteDeadline(time.Time{})
	if err != nil {
		_ = connection.Close()
		return nil, err
	}
	recordCapacity := MaxQueuedBytes/minPacketRecordSize + 1
	return &Session{
		connection: connection,
		writes:     make(chan []byte, recordCapacity),
		done:       make(chan struct{}),
	}, nil
}

// Send queues one ZeroTier wire packet for the relay. It never blocks and
// returns ErrQueueFull once the official per-session byte limit is reached.
func (s *Session) Send(remote netip.AddrPort, packet []byte) error {
	record, err := EncodePacket(remote, packet)
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return ErrSessionClosed
	}
	if s.queued+len(record) > MaxQueuedBytes {
		return ErrQueueFull
	}
	select {
	case s.writes <- record:
		s.queued += len(record)
		return nil
	default:
		return ErrQueueFull
	}
}

// Run processes the session until the connection fails, Close is called, or
// handler rejects a packet. Only one Run call is permitted.
func (s *Session) Run(handler PacketHandler) error {
	if handler == nil {
		return errors.New("nil ZeroTier TCP fallback packet handler")
	}
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return ErrSessionRunning
	}
	if s.closed {
		s.mu.Unlock()
		return ErrSessionClosed
	}
	s.running = true
	s.mu.Unlock()

	go s.runWriter()
	for {
		_ = s.connection.SetReadDeadline(time.Now().Add(IdleTimeout))
		record, err := ReadRecord(s.connection)
		if err != nil {
			return s.stop(err)
		}
		if record.Hello || !record.Remote.IsValid() {
			continue
		}
		if err = handler(record.Remote, record.Packet); err != nil {
			return s.stop(err)
		}
	}
}

// Close terminates the session and unblocks Run. It is safe to call more than
// once and concurrently with Send or Run.
func (s *Session) Close() error {
	return s.stop(nil)
}

// runWriter drains queued records until the session stops or a write fails.
func (s *Session) runWriter() {
	for {
		select {
		case record := <-s.writes:
			_ = s.connection.SetWriteDeadline(time.Now().Add(writeTimeout))
			err := WriteRecord(s.connection, record)
			s.mu.Lock()
			s.queued -= len(record)
			if s.queued < 0 {
				s.queued = 0
			}
			s.mu.Unlock()
			if err != nil {
				s.stop(err)
				return
			}
		case <-s.done:
			return
		}
	}
}

// stop closes the session once, preserves cause, and returns the final error.
func (s *Session) stop(cause error) error {
	s.mu.Lock()
	if cause != nil && s.err == nil {
		s.err = cause
	}
	firstClose := !s.closed
	if firstClose {
		s.closed = true
		close(s.done)
	}
	result := s.err
	s.mu.Unlock()
	var closeErr error
	if firstClose {
		closeErr = s.connection.Close()
	}
	if result != nil {
		return result
	}
	return closeErr
}

// Policy tracks the official fail-forward timing for one wire transport.
// Callers must serialize access with their transport state.
type Policy struct {
	force      bool
	active     bool
	startedAt  time.Time
	lastDirect time.Time
	lastSend   time.Time
}

// Decision describes how an eligible global IPv4 send affects fallback.
type Decision struct {
	Relay   bool
	Connect bool
}

// NewPolicy creates a fallback policy in automatic or forced mode. Reset
// should be called when its wire transport starts.
func NewPolicy(force bool) Policy {
	return Policy{force: force}
}

// Force reports whether all eligible sends require TCP fallback.
func (p Policy) Force() bool {
	return p.force
}

// Reset starts a new transport timing window and forgets observations from
// the retired transport.
func (p *Policy) Reset(now time.Time) {
	p.active = !now.IsZero()
	p.startedAt = now
	p.lastDirect = time.Time{}
	p.lastSend = time.Time{}
}

// ObserveSend records an eligible global IPv4 send and returns whether it
// should use a relay and whether a missing session should be opened.
func (p *Policy) ObserveSend(now time.Time) Decision {
	lastSend := p.lastSend
	p.lastSend = now
	relay := p.RelayRequired(now)
	connect := p.force || (!lastSend.IsZero() && now.Sub(lastSend) > ConnectAfter && now.Sub(lastSend) < FallbackAfter)
	return Decision{Relay: relay, Connect: relay && connect}
}

// RelayRequired reports whether direct global UDP has remained unavailable
// long enough to require fallback.
func (p Policy) RelayRequired(now time.Time) bool {
	return p.force || (p.active && now.Sub(p.startedAt) > FallbackAfter &&
		(p.lastDirect.IsZero() || now.Sub(p.lastDirect) > FallbackAfter))
}

// ObserveDirect records a packet received directly from a global endpoint.
func (p *Policy) ObserveDirect(now time.Time) {
	p.lastDirect = now
}

// Eligible reports whether a wire packet participates in the official TCP
// fallback policy. The public relay accepts outbound IPv4 endpoints only.
func Eligible(remote netip.AddrPort, packetSize int) bool {
	return remote.Addr().Is4() && DirectEvidence(remote, packetSize)
}

// DirectEvidence reports whether a directly received packet proves that
// global UDP is working. Either IP family is evidence even though the public
// relay accepts outbound IPv4 endpoints only.
func DirectEvidence(remote netip.AddrPort, packetSize int) bool {
	return remote.IsValid() && packetSize > zerotier.FragmentHeaderSize && zerotier.IsGlobalPhysicalAddress(remote.Addr())
}
