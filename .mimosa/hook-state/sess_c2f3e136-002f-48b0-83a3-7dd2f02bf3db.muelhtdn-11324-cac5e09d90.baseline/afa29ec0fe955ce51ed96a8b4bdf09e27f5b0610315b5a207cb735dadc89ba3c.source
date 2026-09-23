// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

package zerotier

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha512"
	"crypto/subtle"
	"encoding/binary"
	"errors"
	"fmt"

	"github.com/metacubex/zerotier-go/internal/ztcrypto"
	"github.com/pierrec/lz4/v4"
	"golang.org/x/crypto/curve25519"
	"golang.org/x/crypto/poly1305"
)

const (
	// MinPhysicalMTU is the smallest accepted ZeroTier wire-packet MTU.
	MinPhysicalMTU = 510
	// DefaultPhysicalMTU is the wire-packet MTU used when none is configured.
	DefaultPhysicalMTU = 1432
	// MaxPhysicalMTU is the largest accepted ZeroTier wire-packet MTU.
	MaxPhysicalMTU = 10324

	// PacketIVOffset is the byte offset of the packet IV and packet ID.
	PacketIVOffset = 0
	// PacketDestOffset is the byte offset of the destination node address.
	PacketDestOffset = 8
	// PacketSourceOffset is the byte offset of the source node address.
	PacketSourceOffset = 13
	// PacketFlagsOffset is the byte offset of the hops, cipher, and packet flags.
	PacketFlagsOffset = 18
	// PacketMACOffset is the byte offset of the packet authenticator.
	PacketMACOffset = 19
	// PacketVerbOffset is the byte offset of the verb and compression flag.
	PacketVerbOffset = 27
	// PacketPayloadOffset is the byte offset at which verb-specific data begins.
	PacketPayloadOffset = 28
	// PacketMinSize is the size of a ZeroTier packet with an empty payload.
	PacketMinSize = PacketPayloadOffset
	// FragmentHeaderSize is the size of a non-head ZeroTier packet fragment.
	FragmentHeaderSize = 16
	// MaxPacketSize bounds a reassembled ZeroTier packet.
	MaxPacketSize = 7 * DefaultPhysicalMTU
	// extendedArmorKeySize is the AES-256 key length derived for protocol-13
	// packet armor.
	extendedArmorKeySize = 32

	// FlagExtendedArmor marks a packet using the protocol-13 extended armor
	// format.
	FlagExtendedArmor = 0x80
	// FlagFragmented marks a packet followed by one or more fragments.
	FlagFragmented = 0x40
	// VerbCompressed marks a verb payload compressed with LZ4.
	VerbCompressed = 0x80
)

// Cipher identifies the armor or encryption scheme encoded in a packet.
type Cipher uint8

const (
	// CipherSuiteC25519Poly1305None authenticates a cleartext payload with the
	// legacy identity-agreement key.
	CipherSuiteC25519Poly1305None Cipher = iota
	// CipherSuiteC25519Poly1305Salsa2012 encrypts the payload with Salsa20/12 and
	// authenticates it with Poly1305.
	CipherSuiteC25519Poly1305Salsa2012
	// CipherSuiteTrustedPath carries a configured trusted-path identifier in
	// place of ordinary packet armor.
	CipherSuiteTrustedPath
	// CipherSuiteAESGMACSIV encrypts and authenticates the payload with the
	// protocol-12 AES-GMAC-SIV construction.
	CipherSuiteAESGMACSIV
)

// String returns the stable protocol name of c.
func (c Cipher) String() string {
	switch c {
	case CipherSuiteC25519Poly1305None:
		return "c25519-poly1305-none"
	case CipherSuiteC25519Poly1305Salsa2012:
		return "c25519-poly1305-salsa20-12"
	case CipherSuiteTrustedPath:
		return "trusted-path"
	case CipherSuiteAESGMACSIV:
		return "aes-gmac-siv"
	default:
		return fmt.Sprintf("cipher(%d)", uint8(c))
	}
}

// MarshalText returns the stable protocol name of c for text-based encoders.
func (c Cipher) MarshalText() ([]byte, error) {
	return []byte(c.String()), nil
}

// UnmarshalText parses the stable protocol name of a packet cipher.
func (c *Cipher) UnmarshalText(text []byte) error {
	var value Cipher
	switch string(text) {
	case "c25519-poly1305-none":
		value = CipherSuiteC25519Poly1305None
	case "c25519-poly1305-salsa20-12":
		value = CipherSuiteC25519Poly1305Salsa2012
	case "trusted-path":
		value = CipherSuiteTrustedPath
	case "aes-gmac-siv":
		value = CipherSuiteAESGMACSIV
	default:
		return fmt.Errorf("invalid ZeroTier cipher %q", text)
	}
	*c = value
	return nil
}

// Verb identifies the operation carried by a ZeroTier packet.
type Verb uint8

const (
	// VerbNOP carries no operation.
	VerbNOP Verb = 0x00
	// VerbHello performs peer identity exchange and path authentication.
	VerbHello Verb = 0x01
	// VerbError reports a failed request or protocol operation.
	VerbError Verb = 0x02
	// VerbOK acknowledges a successful request and may carry response data.
	VerbOK Verb = 0x03
	// VerbWhois requests one or more peer identities from a root.
	VerbWhois Verb = 0x04
	// VerbRendezvous tells peers about candidate direct physical endpoints.
	VerbRendezvous Verb = 0x05
	// VerbFrame carries a normal virtual Ethernet frame.
	VerbFrame Verb = 0x06
	// VerbExtFrame carries a bridged Ethernet frame with explicit MAC metadata.
	VerbExtFrame Verb = 0x07
	// VerbEcho probes or confirms a peer path.
	VerbEcho Verb = 0x08
	// VerbMulticastLike announces interest in a multicast group.
	VerbMulticastLike Verb = 0x09
	// VerbNetworkCredentials carries membership, ownership, tag, capability, or
	// revocation credentials.
	VerbNetworkCredentials Verb = 0x0a
	// VerbNetworkConfigRequest requests configuration from a network controller.
	VerbNetworkConfigRequest Verb = 0x0b
	// VerbNetworkConfig carries controller configuration chunks.
	VerbNetworkConfig Verb = 0x0c
	// VerbMulticastGather requests members interested in a multicast group.
	VerbMulticastGather Verb = 0x0d
	// VerbMulticastFrame carries a replicated multicast Ethernet frame.
	VerbMulticastFrame Verb = 0x0e
	// VerbPushDirectPaths advertises candidate direct physical paths.
	VerbPushDirectPaths Verb = 0x10
	// VerbACK acknowledges receipt without additional response data.
	VerbACK Verb = 0x12
	// VerbQoSMeasurement carries multipath quality measurements.
	VerbQoSMeasurement Verb = 0x13
	// VerbUserMessage carries an application-defined node message.
	VerbUserMessage Verb = 0x14
	// VerbRemoteTrace carries structured remote diagnostics.
	VerbRemoteTrace Verb = 0x15
	// VerbPathNegotiation coordinates active-backup path selection.
	VerbPathNegotiation Verb = 0x16
)

// String returns the stable protocol name of v.
func (v Verb) String() string {
	switch v {
	case VerbNOP:
		return "nop"
	case VerbHello:
		return "hello"
	case VerbError:
		return "error"
	case VerbOK:
		return "ok"
	case VerbWhois:
		return "whois"
	case VerbRendezvous:
		return "rendezvous"
	case VerbFrame:
		return "frame"
	case VerbExtFrame:
		return "ext-frame"
	case VerbEcho:
		return "echo"
	case VerbMulticastLike:
		return "multicast-like"
	case VerbNetworkCredentials:
		return "network-credentials"
	case VerbNetworkConfigRequest:
		return "network-config-request"
	case VerbNetworkConfig:
		return "network-config"
	case VerbMulticastGather:
		return "multicast-gather"
	case VerbMulticastFrame:
		return "multicast-frame"
	case VerbPushDirectPaths:
		return "push-direct-paths"
	case VerbACK:
		return "ack"
	case VerbQoSMeasurement:
		return "qos-measurement"
	case VerbUserMessage:
		return "user-message"
	case VerbRemoteTrace:
		return "remote-trace"
	case VerbPathNegotiation:
		return "path-negotiation"
	default:
		return fmt.Sprintf("verb(%d)", uint8(v))
	}
}

// MarshalText returns the stable protocol name of v for text-based encoders.
func (v Verb) MarshalText() ([]byte, error) {
	return []byte(v.String()), nil
}

// UnmarshalText parses the stable protocol name of a packet verb.
func (v *Verb) UnmarshalText(text []byte) error {
	var value Verb
	switch string(text) {
	case "nop":
		value = VerbNOP
	case "hello":
		value = VerbHello
	case "error":
		value = VerbError
	case "ok":
		value = VerbOK
	case "whois":
		value = VerbWhois
	case "rendezvous":
		value = VerbRendezvous
	case "frame":
		value = VerbFrame
	case "ext-frame":
		value = VerbExtFrame
	case "echo":
		value = VerbEcho
	case "multicast-like":
		value = VerbMulticastLike
	case "network-credentials":
		value = VerbNetworkCredentials
	case "network-config-request":
		value = VerbNetworkConfigRequest
	case "network-config":
		value = VerbNetworkConfig
	case "multicast-gather":
		value = VerbMulticastGather
	case "multicast-frame":
		value = VerbMulticastFrame
	case "push-direct-paths":
		value = VerbPushDirectPaths
	case "ack":
		value = VerbACK
	case "qos-measurement":
		value = VerbQoSMeasurement
	case "user-message":
		value = VerbUserMessage
	case "remote-trace":
		value = VerbRemoteTrace
	case "path-negotiation":
		value = VerbPathNegotiation
	default:
		return fmt.Errorf("invalid ZeroTier verb %q", text)
	}
	*v = value
	return nil
}

var (
	// ErrInvalidPacket reports malformed, truncated, or oversized packet data.
	ErrInvalidPacket = errors.New("invalid ZeroTier packet")
	// ErrUnsupportedCipher reports a packet cipher outside the implemented wire
	// protocol suites.
	ErrUnsupportedCipher = errors.New("unsupported ZeroTier cipher")
)

// Packet is a ZeroTier wire packet. Multi-byte verb fields use network byte
// order; the IV and MAC are opaque bytes.
type Packet struct {
	data         []byte
	sentPacketID uint64
	err          error
}

// NewPacket creates an unarmored packet with a random packet ID.
func NewPacket(destination, source Address, verb Verb) (*Packet, error) {
	return newPacketWithPayloadCapacity(destination, source, verb, 0)
}

// newPacketWithPayloadCapacity creates a packet with exact append storage for
// a known verb payload.
func newPacketWithPayloadCapacity(destination, source Address, verb Verb, payloadCapacity int) (*Packet, error) {
	if payloadCapacity < 0 || payloadCapacity > MaxPacketSize-PacketMinSize {
		return nil, ErrInvalidPacket
	}
	data := make([]byte, PacketMinSize, PacketMinSize+payloadCapacity)
	if _, err := rand.Read(data[PacketIVOffset:PacketDestOffset]); err != nil {
		return nil, err
	}
	dest := destination.Bytes()
	src := source.Bytes()
	copy(data[PacketDestOffset:PacketSourceOffset], dest[:])
	copy(data[PacketSourceOffset:PacketFlagsOffset], src[:])
	data[PacketVerbOffset] = byte(verb)
	return &Packet{data: data}, nil
}

// ParsePacket copies and validates the common bounds of one wire packet.
func ParsePacket(data []byte) (*Packet, error) {
	if len(data) < PacketMinSize || len(data) > MaxPacketSize {
		return nil, ErrInvalidPacket
	}
	return parsePacketOwned(append([]byte(nil), data...))
}

// parsePacketOwned validates data and transfers its storage to the returned
// packet. Callers must not use data after a successful call.
func parsePacketOwned(data []byte) (*Packet, error) {
	if len(data) < PacketMinSize || len(data) > MaxPacketSize {
		return nil, ErrInvalidPacket
	}
	return &Packet{data: data}, nil
}

// Clone returns an independently owned copy of p and its sticky error state.
func (p *Packet) Clone() *Packet {
	return &Packet{data: append([]byte(nil), p.data...), sentPacketID: p.sentPacketID, err: p.err}
}

// Bytes returns the packet's mutable wire buffer.
func (p *Packet) Bytes() []byte { return p.data }

// Err reports the first serialization error encountered while building p.
// Append errors are sticky so callers cannot accidentally armor and transmit a
// truncated packet after ignoring an individual Append return value.
func (p *Packet) Err() error { return p.err }

// Append extends the packet and records an oversized-packet error persistently.
func (p *Packet) Append(data ...byte) error {
	if p.err != nil {
		return p.err
	}
	if len(p.data)+len(data) > MaxPacketSize {
		p.err = ErrInvalidPacket
		return p.err
	}
	p.data = append(p.data, data...)
	return nil
}

// AppendUint16 appends v in network byte order.
func (p *Packet) AppendUint16(v uint16) error {
	var b [2]byte
	binary.BigEndian.PutUint16(b[:], v)
	return p.Append(b[:]...)
}

// AppendUint32 appends v in network byte order.
func (p *Packet) AppendUint32(v uint32) error {
	var b [4]byte
	binary.BigEndian.PutUint32(b[:], v)
	return p.Append(b[:]...)
}

// AppendUint64 appends v in network byte order.
func (p *Packet) AppendUint64(v uint64) error {
	var b [8]byte
	binary.BigEndian.PutUint64(b[:], v)
	return p.Append(b[:]...)
}

// Destination returns the destination node address from the common header.
func (p *Packet) Destination() Address {
	a, _ := AddressFromBytes(p.data[PacketDestOffset:PacketSourceOffset])
	return a
}

// Source returns the source node address from the common header.
func (p *Packet) Source() Address {
	a, _ := AddressFromBytes(p.data[PacketSourceOffset:PacketFlagsOffset])
	return a
}

// Cipher returns the packet's encoded armor suite.
func (p *Packet) Cipher() Cipher { return Cipher((p.data[PacketFlagsOffset] & 0x38) >> 3) }

// SetCipher replaces the packet's encoded armor suite.
func (p *Packet) SetCipher(cipher Cipher) {
	p.data[PacketFlagsOffset] = (p.data[PacketFlagsOffset] & 0xc7) | ((byte(cipher) << 3) & 0x38)
}

// TrustedPathID returns the physical trusted-path identifier stored in the
// packet MAC field. It is meaningful only when Cipher reports
// CipherSuiteTrustedPath.
func (p *Packet) TrustedPathID() uint64 {
	return binary.BigEndian.Uint64(p.data[PacketMACOffset:PacketVerbOffset])
}

// SetTrusted marks p as authenticated by a configured physical path. Trusted
// packets are intentionally neither encrypted nor cryptographically
// authenticated, so receivers must verify both the source prefix and this ID.
func (p *Packet) SetTrusted(id uint64) {
	p.SetCipher(CipherSuiteTrustedPath)
	binary.BigEndian.PutUint64(p.data[PacketMACOffset:PacketVerbOffset], id)
}

// ExtendedArmor reports whether protocol-13 ephemeral armor is present.
func (p *Packet) ExtendedArmor() bool { return p.data[PacketFlagsOffset]&FlagExtendedArmor != 0 }

// Hops returns the packet's three-bit relay hop count.
func (p *Packet) Hops() uint8 { return p.data[PacketFlagsOffset] & 0x07 }

// Fragmented reports whether additional packet fragments follow.
func (p *Packet) Fragmented() bool { return p.data[PacketFlagsOffset]&FlagFragmented != 0 }

// SetFragmented sets or clears the fragmented-packet flag.
func (p *Packet) SetFragmented(fragmented bool) {
	if fragmented {
		p.data[PacketFlagsOffset] |= FlagFragmented
	} else {
		p.data[PacketFlagsOffset] &^= FlagFragmented
	}
}

// Verb returns the packet operation without the compression flag.
func (p *Packet) Verb() Verb { return Verb(p.data[PacketVerbOffset] & 0x1f) }

// Compressed reports whether the verb payload is LZ4-compressed.
func (p *Packet) Compressed() bool { return p.data[PacketVerbOffset]&VerbCompressed != 0 }

// Payload returns the mutable verb-specific packet payload.
func (p *Packet) Payload() []byte { return p.data[PacketPayloadOffset:] }

// PacketID returns the packet IV interpreted as a network-order identifier.
func (p *Packet) PacketID() uint64 {
	if len(p.data) >= PacketDestOffset {
		return binary.BigEndian.Uint64(p.data[PacketIVOffset:PacketDestOffset])
	}
	return p.sentPacketID
}

// takeBytes transfers the packet's wire storage while retaining its final ID
// for request bookkeeping. Callers must not serialize or transmit p again.
func (p *Packet) takeBytes() []byte {
	p.sentPacketID = p.PacketID()
	data := p.data
	p.data = nil
	return data[:len(data):len(data)]
}

// Uncompress expands a raw LZ4-compressed verb payload.
func (p *Packet) Uncompress() error {
	if p.err != nil {
		return p.err
	}
	if !p.Compressed() {
		return nil
	}
	destination := make([]byte, MaxPacketSize-PacketPayloadOffset)
	n, err := lz4.UncompressBlock(p.data[PacketPayloadOffset:], destination)
	if err != nil || n <= 0 || PacketPayloadOffset+n > MaxPacketSize {
		return ErrInvalidPacket
	}
	p.data = append(p.data[:PacketPayloadOffset], destination[:n]...)
	p.data[PacketVerbOffset] &^= VerbCompressed
	return nil
}

// Compress replaces the verb payload with a raw LZ4 block when doing so makes
// the packet smaller. ZeroTier carries no LZ4 frame header or size prefix.
func (p *Packet) Compress() error {
	if p.err != nil {
		return p.err
	}
	if p.Compressed() || len(p.data) < PacketPayloadOffset {
		return ErrInvalidPacket
	}
	payload := p.data[PacketPayloadOffset:]
	if len(payload) == 0 {
		return nil
	}
	compressed := make([]byte, lz4.CompressBlockBound(len(payload)))
	n, err := lz4.CompressBlock(payload, compressed, nil)
	if err != nil {
		return err
	}
	if n <= 0 || n >= len(payload) {
		return nil
	}
	p.data = append(p.data[:PacketPayloadOffset], compressed[:n]...)
	p.data[PacketVerbOffset] |= VerbCompressed
	return nil
}

// Armor authenticates p and optionally encrypts its verb and payload. AES-GMAC-
// SIV and extended armor are negotiated separately and are not used here.
func (p *Packet) Armor(key []byte, encrypt bool) error {
	if p.err != nil {
		return p.err
	}
	if len(key) < 32 || len(p.data) < PacketMinSize {
		return ErrInvalidPacket
	}
	if encrypt {
		p.SetCipher(CipherSuiteC25519Poly1305Salsa2012)
	} else {
		p.SetCipher(CipherSuiteC25519Poly1305None)
	}
	mangled := p.mangleKey(key[:32])
	var nonce [8]byte
	copy(nonce[:], p.data[PacketIVOffset:PacketDestOffset])
	stream := make([]byte, 64+len(p.data)-PacketVerbOffset)
	ztcrypto.Salsa2012XORKeyStream(stream, stream, &nonce, &mangled)
	payload := p.data[PacketVerbOffset:]
	if encrypt {
		for i := range payload {
			payload[i] ^= stream[64+i]
		}
	}
	var macKey [32]byte
	copy(macKey[:], stream[:32])
	var tag [16]byte
	poly1305.Sum(&tag, payload, &macKey)
	copy(p.data[PacketMACOffset:PacketVerbOffset], tag[:8])
	return nil
}

// ArmorAES authenticates and encrypts the verb and payload with ZeroTier's
// protocol-12 AES-GMAC-SIV construction.
func (p *Packet) ArmorAES(key []byte) error {
	if p.err != nil {
		return p.err
	}
	if len(key) < SymmetricKeySize || len(p.data) < PacketMinSize {
		return ErrInvalidPacket
	}
	keys, err := ztcrypto.NewGMACSIVKeys(key)
	if err != nil {
		return ErrInvalidPacket
	}
	return p.armorAESWithKeys(&keys)
}

// armorAESWithKeys applies protocol-12 armor with a peer's cached AES keys.
func (p *Packet) armorAESWithKeys(keys *ztcrypto.GMACSIVKeys) error {
	if p.err != nil {
		return p.err
	}
	if keys == nil || len(p.data) < PacketMinSize {
		return ErrInvalidPacket
	}
	p.SetCipher(CipherSuiteAESGMACSIV)
	payload := p.data[PacketVerbOffset:]
	_, opaque := keys.Seal(payload[:0], p.data[PacketIVOffset:PacketDestOffset], payload, p.data[PacketDestOffset:PacketMACOffset])
	copy(p.data[PacketIVOffset:PacketDestOffset], opaque[:8])
	copy(p.data[PacketMACOffset:PacketVerbOffset], opaque[8:])
	return nil
}

// ArmorExtended applies protocol-13 ephemeral encryption to a cleartext HELLO
// after its normal Salsa20/Poly1305 authentication.
func (p *Packet) ArmorExtended(key []byte, peer Identity) error {
	if p.err != nil {
		return p.err
	}
	if len(p.data)+extendedArmorKeySize > MaxPacketSize {
		return ErrInvalidPacket
	}
	p.data[PacketFlagsOffset] |= FlagExtendedArmor
	if err := p.Armor(key, false); err != nil {
		return err
	}
	var ephemeralPrivate [32]byte
	if _, err := rand.Read(ephemeralPrivate[:]); err != nil {
		return err
	}
	ephemeralPublic, err := curve25519.X25519(ephemeralPrivate[:], curve25519.Basepoint)
	if err != nil {
		return err
	}
	peerPublic := peer.PublicKey()
	raw, err := curve25519.X25519(ephemeralPrivate[:], peerPublic[:32])
	if err != nil {
		return err
	}
	digest := sha512.Sum512(raw)
	block, err := aes.NewCipher(digest[:32])
	if err != nil {
		return err
	}
	var iv [aes.BlockSize]byte
	copy(iv[:12], p.data[:12])
	cipher.NewCTR(block, iv[:]).XORKeyStream(p.data[PacketMACOffset:], p.data[PacketMACOffset:])
	p.data = append(p.data, ephemeralPublic...)
	return nil
}

// Dearmor verifies p and decrypts its verb and payload when required.
func (p *Packet) Dearmor(key []byte) error {
	return p.DearmorWithIdentity(key, Identity{})
}

// DearmorWithIdentity authenticates and decrypts p, including protocol-13
// ephemeral armor when identity is supplied.
func (p *Packet) DearmorWithIdentity(key []byte, identity Identity) error {
	return p.dearmorWithIdentityAndAES(key, nil, identity)
}

// dearmorWithIdentityAndAES verifies a packet while reusing cached peer keys
// when it carries protocol-12 AES-GMAC-SIV armor.
func (p *Packet) dearmorWithIdentityAndAES(key []byte, aesKeys *ztcrypto.GMACSIVKeys, identity Identity) error {
	if p.err != nil {
		return p.err
	}
	if len(key) < 32 || len(p.data) < PacketMinSize {
		return ErrInvalidPacket
	}
	suite := p.Cipher()
	if p.ExtendedArmor() && suite == CipherSuiteC25519Poly1305None {
		if len(p.data) < PacketMinSize+extendedArmorKeySize {
			return ErrInvalidPacket
		}
		ephemeralAt := len(p.data) - extendedArmorKeySize
		ephemeralKey, err := identity.agreeEphemeral(p.data[ephemeralAt:])
		if err != nil {
			return ErrInvalidPacket
		}
		block, err := aes.NewCipher(ephemeralKey[:])
		if err != nil {
			return err
		}
		var iv [aes.BlockSize]byte
		copy(iv[:12], p.data[:12])
		cipher.NewCTR(block, iv[:]).XORKeyStream(p.data[PacketMACOffset:ephemeralAt], p.data[PacketMACOffset:ephemeralAt])
		p.data = p.data[:ephemeralAt]
	}
	if suite == CipherSuiteAESGMACSIV {
		if len(key) < SymmetricKeySize {
			return ErrInvalidPacket
		}
		if aesKeys == nil {
			keys, err := ztcrypto.NewGMACSIVKeys(key[:SymmetricKeySize])
			if err != nil {
				return ErrInvalidPacket
			}
			aesKeys = &keys
		}
		var opaque [16]byte
		copy(opaque[:8], p.data[PacketIVOffset:PacketDestOffset])
		copy(opaque[8:], p.data[PacketMACOffset:PacketVerbOffset])
		oldFlags := p.data[PacketFlagsOffset]
		p.data[PacketFlagsOffset] &= 0xf8
		payload := p.data[PacketVerbOffset:]
		_, err := aesKeys.Open(payload[:0], opaque, payload, p.data[PacketDestOffset:PacketMACOffset])
		p.data[PacketFlagsOffset] = oldFlags
		if err != nil {
			return ErrInvalidPacket
		}
		return nil
	}
	if suite != CipherSuiteC25519Poly1305None && suite != CipherSuiteC25519Poly1305Salsa2012 {
		return fmt.Errorf("%w: %d", ErrUnsupportedCipher, suite)
	}
	mangled := p.mangleKey(key[:32])
	var nonce [8]byte
	copy(nonce[:], p.data[PacketIVOffset:PacketDestOffset])
	stream := make([]byte, 64+len(p.data)-PacketVerbOffset)
	ztcrypto.Salsa2012XORKeyStream(stream, stream, &nonce, &mangled)
	payload := p.data[PacketVerbOffset:]
	var macKey [32]byte
	copy(macKey[:], stream[:32])
	var tag [16]byte
	poly1305.Sum(&tag, payload, &macKey)
	if subtle.ConstantTimeCompare(p.data[PacketMACOffset:PacketVerbOffset], tag[:8]) != 1 {
		return ErrInvalidPacket
	}
	if suite == CipherSuiteC25519Poly1305Salsa2012 {
		for i := range payload {
			payload[i] ^= stream[64+i]
		}
	}
	return nil
}

// CryptField applies the secondary HELLO field protection stream.
func (p *Packet) CryptField(key []byte, start, length int) error {
	if p.err != nil {
		return p.err
	}
	if len(key) < 32 || start < 0 || length < 0 || start+length > len(p.data) {
		return ErrInvalidPacket
	}
	var k [32]byte
	copy(k[:], key[:32])
	var nonce [8]byte
	copy(nonce[:], p.data[PacketIVOffset:PacketDestOffset])
	nonce[7] &= 0xf8
	ztcrypto.Salsa2012XORKeyStream(p.data[start:start+length], p.data[start:start+length], &nonce, &k)
	return nil
}

// mangleKey binds the legacy packet armor key to immutable header fields.
func (p *Packet) mangleKey(key []byte) [32]byte {
	var out [32]byte
	copy(out[:], key)
	for i := 0; i < 18; i++ {
		out[i] ^= p.data[i]
	}
	out[18] ^= p.data[PacketFlagsOffset] & 0xf8
	out[19] ^= byte(len(p.data))
	out[20] ^= byte(len(p.data) >> 8)
	return out
}
