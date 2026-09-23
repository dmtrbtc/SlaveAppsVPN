// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

package zerotier

import (
	"encoding/binary"
	"fmt"
)

// maxRevocationsPerPacket bounds revocations decoded from one credential packet.
const maxRevocationsPerPacket = 64

// CredentialType identifies a signed network credential on the wire.
type CredentialType uint8

const (
	// CredentialTypeCOM identifies a certificate of membership.
	CredentialTypeCOM CredentialType = 1
	// CredentialTypeCapability identifies a network capability.
	CredentialTypeCapability CredentialType = 2
	// CredentialTypeTag identifies a network tag.
	CredentialTypeTag CredentialType = 3
	// CredentialTypeOwnership identifies a certificate of ownership.
	CredentialTypeOwnership CredentialType = 4
	// CredentialTypeRevocation identifies a signed credential revocation.
	CredentialTypeRevocation CredentialType = 6
)

// String returns the stable protocol name of t.
func (t CredentialType) String() string {
	switch t {
	case CredentialTypeCOM:
		return "com"
	case CredentialTypeCapability:
		return "capability"
	case CredentialTypeTag:
		return "tag"
	case CredentialTypeOwnership:
		return "ownership"
	case CredentialTypeRevocation:
		return "revocation"
	default:
		return fmt.Sprintf("credential-type(%d)", uint8(t))
	}
}

// MarshalText returns the stable protocol name of t for text-based encoders.
func (t CredentialType) MarshalText() ([]byte, error) {
	return []byte(t.String()), nil
}

// UnmarshalText parses the stable protocol name of a credential type.
func (t *CredentialType) UnmarshalText(text []byte) error {
	var value CredentialType
	switch string(text) {
	case "com":
		value = CredentialTypeCOM
	case "capability":
		value = CredentialTypeCapability
	case "tag":
		value = CredentialTypeTag
	case "ownership":
		value = CredentialTypeOwnership
	case "revocation":
		value = CredentialTypeRevocation
	default:
		return fmt.Errorf("invalid ZeroTier credential type %q", text)
	}
	*t = value
	return nil
}

// Revocation invalidates a signed network credential or credential class.
type Revocation struct {
	ID           uint32
	NetworkID    uint64
	CredentialID uint32
	Threshold    uint64
	Flags        uint64
	Target       Address
	SignedBy     Address
	Type         CredentialType
	Signature    [SignatureSize]byte
	raw          []byte
}

// ParseRevocation decodes one signed credential revocation and reports the
// number of bytes consumed.
func ParseRevocation(data []byte) (Revocation, int, error) {
	const fixedSize = 4 + 4 + 8 + 4 + 4 + 8 + 8 + AddressSize*2 + 1
	if len(data) < fixedSize+3+SignatureSize+2 {
		return Revocation{}, 0, ErrInvalidPacket
	}
	revocation := Revocation{
		ID:           binary.BigEndian.Uint32(data[4:]),
		NetworkID:    binary.BigEndian.Uint64(data[8:]),
		CredentialID: binary.BigEndian.Uint32(data[20:]),
		Threshold:    binary.BigEndian.Uint64(data[24:]),
		Flags:        binary.BigEndian.Uint64(data[32:]),
	}
	pos := 40
	var err error
	revocation.Target, err = AddressFromBytes(data[pos : pos+AddressSize])
	if err != nil {
		return Revocation{}, 0, err
	}
	pos += AddressSize
	revocation.SignedBy, err = AddressFromBytes(data[pos : pos+AddressSize])
	if err != nil {
		return Revocation{}, 0, err
	}
	pos += AddressSize
	revocation.Type = CredentialType(data[pos])
	pos++
	if revocation.Type < CredentialTypeCOM || revocation.Type > CredentialTypeOwnership || data[pos] != 1 || int(binary.BigEndian.Uint16(data[pos+1:])) != SignatureSize {
		return Revocation{}, 0, ErrInvalidPacket
	}
	pos += 3
	copy(revocation.Signature[:], data[pos:pos+SignatureSize])
	pos += SignatureSize
	extensionLength := int(binary.BigEndian.Uint16(data[pos:]))
	pos += 2
	if len(data)-pos < extensionLength {
		return Revocation{}, 0, ErrInvalidPacket
	}
	pos += extensionLength
	revocation.raw = append([]byte(nil), data[:pos]...)
	return revocation, pos, nil
}

// Verify authenticates revocation with its network controller identity.
func (revocation Revocation) Verify(controller Identity) bool {
	return revocation.NetworkID != 0 && !revocation.Target.IsZero() && revocation.SignedBy == Controller(revocation.NetworkID) &&
		controller.Address() == revocation.SignedBy && controller.Verify(revocation.signedData(), revocation.Signature[:])
}

// FastPropagate reports whether revocation requests immediate peer propagation.
func (revocation Revocation) FastPropagate() bool { return revocation.Flags&1 != 0 }

// signedData serializes the fields authenticated by the controller signature.
func (revocation Revocation) signedData() []byte {
	data := make([]byte, 0, 80)
	data = binary.BigEndian.AppendUint64(data, 0x7f7f7f7f7f7f7f7f)
	data = appendRevocationBase(data, revocation)
	data = binary.BigEndian.AppendUint16(data, 0)
	return binary.BigEndian.AppendUint64(data, 0x7f7f7f7f7f7f7f7f)
}

// appendBinary appends the complete revocation wire encoding.
func (revocation Revocation) appendBinary(data []byte) []byte {
	if len(revocation.raw) != 0 {
		return append(data, revocation.raw...)
	}
	data = appendRevocationBase(data, revocation)
	data = append(data, 1)
	data = binary.BigEndian.AppendUint16(data, SignatureSize)
	data = append(data, revocation.Signature[:]...)
	return binary.BigEndian.AppendUint16(data, 0)
}

// appendRevocationBase serializes the signed fields of revocation.
func appendRevocationBase(data []byte, revocation Revocation) []byte {
	data = binary.BigEndian.AppendUint32(data, 0)
	data = binary.BigEndian.AppendUint32(data, revocation.ID)
	data = binary.BigEndian.AppendUint64(data, revocation.NetworkID)
	data = binary.BigEndian.AppendUint32(data, 0)
	data = binary.BigEndian.AppendUint32(data, revocation.CredentialID)
	data = binary.BigEndian.AppendUint64(data, revocation.Threshold)
	data = binary.BigEndian.AppendUint64(data, revocation.Flags)
	target := revocation.Target.Bytes()
	signedBy := revocation.SignedBy.Bytes()
	data = append(data, target[:]...)
	data = append(data, signedBy[:]...)
	return append(data, byte(revocation.Type))
}
