// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Package tcpfallback implements the official ZeroTier TCP relay framing,
// fail-forward policy, and established connection lifecycle. The embedding
// remains responsible for dialing so proxy and network policy stay outside the
// core.
package tcpfallback

import (
	"encoding/binary"
	"errors"
	"io"
	"net/netip"
	"time"

	zerotier "github.com/metacubex/zerotier-go"
)

const (
	// DefaultRelay is the fallback relay operated for the public ZeroTier
	// network.
	DefaultRelay = "204.80.128.1:443"

	// FallbackAfter is the official delay before engaging TCP fallback when
	// direct global UDP remains unavailable.
	FallbackAfter = 60 * time.Second

	// ConnectAfter is the minimum interval between eligible global sends before
	// opening a fallback connection.
	ConnectAfter = 2500 * time.Millisecond

	// IdleTimeout bounds a fallback connection that stops delivering records.
	IdleTimeout = 60 * time.Second

	// MaxQueuedBytes is the official per-connection fallback write queue limit.
	MaxQueuedBytes = 64 * 1024
)

// recordHeaderSize is the pseudo-TLS type, version, and payload-length prefix.
const recordHeaderSize = 5

// Record is one decoded fallback relay record. Hello records have Hello set
// and no endpoint or packet. Records with an omitted endpoint have an invalid
// Remote address and are ignored by leaf clients.
type Record struct {
	Remote netip.AddrPort
	Packet []byte
	Hello  bool
}

// HelloRecord returns the official pseudo-TLS client hello record containing
// this library's ZeroTier version.
func HelloRecord() []byte {
	return []byte{
		0x17, 0x03, 0x03, 0, 4,
		zerotier.NodeVersionMajor,
		zerotier.NodeVersionMinor,
		byte(zerotier.NodeVersionRevision >> 8),
		byte(zerotier.NodeVersionRevision),
	}
}

// EncodePacket encodes an outbound ZeroTier packet for the fallback relay.
// The official outgoing relay protocol supports IPv4 physical endpoints only.
func EncodePacket(remote netip.AddrPort, packet []byte) ([]byte, error) {
	if !remote.IsValid() || remote.Port() == 0 || !remote.Addr().Is4() {
		return nil, errors.New("ZeroTier TCP fallback supports IPv4 endpoints only")
	}
	payloadLength := len(packet) + 7
	if payloadLength > 65535 {
		return nil, errors.New("ZeroTier TCP fallback packet is too large")
	}
	record := make([]byte, 12+len(packet))
	record[0], record[1], record[2] = 0x17, 0x03, 0x03
	binary.BigEndian.PutUint16(record[3:5], uint16(payloadLength))
	record[5] = 4
	address := remote.Addr().As4()
	copy(record[6:10], address[:])
	binary.BigEndian.PutUint16(record[10:12], remote.Port())
	copy(record[12:], packet)
	return record, nil
}

// WriteRecord writes a complete encoded record, handling short writes.
func WriteRecord(writer io.Writer, record []byte) error {
	for len(record) != 0 {
		n, err := writer.Write(record)
		if err != nil {
			return err
		}
		if n == 0 {
			return io.ErrShortWrite
		}
		record = record[n:]
	}
	return nil
}

// ReadRecord reads and decodes one record from the fallback relay.
func ReadRecord(reader io.Reader) (Record, error) {
	var header [recordHeaderSize]byte
	if _, err := io.ReadFull(reader, header[:]); err != nil {
		return Record{}, err
	}
	payloadLength := int(binary.BigEndian.Uint16(header[3:5]))
	if payloadLength == 4 {
		var hello [4]byte
		_, err := io.ReadFull(reader, hello[:])
		return Record{Hello: true}, err
	}
	if payloadLength <= 0 || payloadLength > zerotier.MaxPacketSize+19 {
		return Record{}, errors.New("invalid ZeroTier TCP fallback record length")
	}
	payload := make([]byte, payloadLength)
	if _, err := io.ReadFull(reader, payload); err != nil {
		return Record{}, err
	}
	var address netip.Addr
	var portOffset, packetOffset int
	switch payload[0] {
	case 0:
		return Record{Packet: payload[1:]}, nil
	case 4:
		if len(payload) < 7 {
			return Record{}, errors.New("short IPv4 ZeroTier TCP fallback record")
		}
		address = netip.AddrFrom4([4]byte(payload[1:5]))
		portOffset, packetOffset = 5, 7
	case 6:
		if len(payload) < 19 {
			return Record{}, errors.New("short IPv6 ZeroTier TCP fallback record")
		}
		address = netip.AddrFrom16([16]byte(payload[1:17]))
		portOffset, packetOffset = 17, 19
	default:
		return Record{}, errors.New("invalid ZeroTier TCP fallback address type")
	}
	port := binary.BigEndian.Uint16(payload[portOffset : portOffset+2])
	if port == 0 || len(payload) == packetOffset {
		return Record{}, errors.New("invalid ZeroTier TCP fallback endpoint or packet")
	}
	return Record{Remote: netip.AddrPortFrom(address, port), Packet: payload[packetOffset:]}, nil
}
