// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

package zerotier

import (
	"encoding/binary"
	"fmt"
	"net/netip"
)

const (
	// maxOwnershipThings is the maximum number of address claims in one
	// certificate of ownership.
	maxOwnershipThings = 16
	// maxOwnershipCerts is the maximum number of ownership certificates in one
	// network configuration.
	maxOwnershipCerts = 4

	// OwnershipThingMAC identifies an Ethernet MAC address asserted by a
	// certificate of ownership.
	OwnershipThingMAC OwnershipThingType = 1
	// OwnershipThingIPv4 identifies an IPv4 address asserted by a certificate
	// of ownership.
	OwnershipThingIPv4 OwnershipThingType = 2
	// OwnershipThingIPv6 identifies an IPv6 address asserted by a certificate
	// of ownership.
	OwnershipThingIPv6 OwnershipThingType = 3
)

// OwnershipThingType identifies the address family of a certificate of
// ownership entry.
type OwnershipThingType uint8

// String returns the stable credential name of t.
func (t OwnershipThingType) String() string {
	switch t {
	case OwnershipThingMAC:
		return "mac"
	case OwnershipThingIPv4:
		return "ipv4"
	case OwnershipThingIPv6:
		return "ipv6"
	default:
		return fmt.Sprintf("ownership-thing-type(%d)", uint8(t))
	}
}

// MarshalText returns the stable credential name of t for text-based encoders.
func (t OwnershipThingType) MarshalText() ([]byte, error) {
	return []byte(t.String()), nil
}

// UnmarshalText parses the stable credential name of an ownership thing type.
func (t *OwnershipThingType) UnmarshalText(text []byte) error {
	var value OwnershipThingType
	switch string(text) {
	case "mac":
		value = OwnershipThingMAC
	case "ipv4":
		value = OwnershipThingIPv4
	case "ipv6":
		value = OwnershipThingIPv6
	default:
		return fmt.Errorf("invalid ZeroTier ownership thing type %q", text)
	}
	*t = value
	return nil
}

// OwnershipThing is one MAC or IP claim in an ownership certificate.
type OwnershipThing struct {
	Type  OwnershipThingType
	Value [16]byte
}

// CertificateOfOwnership is a controller-signed set of MAC or IP claims.
type CertificateOfOwnership struct {
	NetworkID uint64
	Timestamp uint64
	Flags     uint64
	ID        uint32
	Things    []OwnershipThing
	IssuedTo  Address
	SignedBy  Address
	Signature [SignatureSize]byte
	raw       []byte
}

// ParseCertificateOfOwnership decodes one ownership certificate and reports
// the number of bytes consumed.
func ParseCertificateOfOwnership(data []byte) (CertificateOfOwnership, int, error) {
	const fixedSize = 8 + 8 + 8 + 4 + 2
	if len(data) < fixedSize {
		return CertificateOfOwnership{}, 0, ErrInvalidPacket
	}
	certificate := CertificateOfOwnership{
		NetworkID: binary.BigEndian.Uint64(data),
		Timestamp: binary.BigEndian.Uint64(data[8:]),
		Flags:     binary.BigEndian.Uint64(data[16:]),
		ID:        binary.BigEndian.Uint32(data[24:]),
	}
	count := int(binary.BigEndian.Uint16(data[28:]))
	if count > maxOwnershipThings {
		return CertificateOfOwnership{}, 0, ErrInvalidPacket
	}
	pos := fixedSize
	if len(data)-pos < count*17+AddressSize*2+3 {
		return CertificateOfOwnership{}, 0, ErrInvalidPacket
	}
	certificate.Things = make([]OwnershipThing, 0, count)
	for i := 0; i < count; i++ {
		thing := OwnershipThing{Type: OwnershipThingType(data[pos])}
		copy(thing.Value[:], data[pos+1:pos+17])
		if thing.Type < OwnershipThingMAC || thing.Type > OwnershipThingIPv6 {
			return CertificateOfOwnership{}, 0, ErrInvalidPacket
		}
		certificate.Things = append(certificate.Things, thing)
		pos += 17
	}
	var err error
	certificate.IssuedTo, err = AddressFromBytes(data[pos : pos+AddressSize])
	if err != nil {
		return CertificateOfOwnership{}, 0, err
	}
	pos += AddressSize
	certificate.SignedBy, err = AddressFromBytes(data[pos : pos+AddressSize])
	if err != nil {
		return CertificateOfOwnership{}, 0, err
	}
	pos += AddressSize
	if len(data)-pos < 3 || data[pos] != 1 || int(binary.BigEndian.Uint16(data[pos+1:])) != SignatureSize {
		return CertificateOfOwnership{}, 0, ErrInvalidPacket
	}
	pos += 3
	if len(data)-pos < SignatureSize+2 {
		return CertificateOfOwnership{}, 0, ErrInvalidPacket
	}
	copy(certificate.Signature[:], data[pos:pos+SignatureSize])
	pos += SignatureSize
	extensionLength := int(binary.BigEndian.Uint16(data[pos:]))
	pos += 2
	if len(data)-pos < extensionLength {
		return CertificateOfOwnership{}, 0, ErrInvalidPacket
	}
	pos += extensionLength
	certificate.raw = append([]byte(nil), data[:pos]...)
	return certificate, pos, nil
}

// Verify authenticates certificate with its network controller identity.
func (certificate CertificateOfOwnership) Verify(controller Identity) bool {
	return certificate.NetworkID != 0 && !certificate.IssuedTo.IsZero() &&
		certificate.SignedBy == Controller(certificate.NetworkID) &&
		controller.Address() == certificate.SignedBy &&
		controller.Verify(certificate.signedData(), certificate.Signature[:])
}

// OwnsMAC reports whether certificate claims mac.
func (certificate CertificateOfOwnership) OwnsMAC(mac MAC) bool {
	value := mac.Bytes()
	return certificate.owns(OwnershipThingMAC, value[:])
}

// OwnsIP reports whether certificate claims address.
func (certificate CertificateOfOwnership) OwnsIP(address netip.Addr) bool {
	address = address.Unmap()
	if address.Is4() {
		value := address.As4()
		return certificate.owns(OwnershipThingIPv4, value[:])
	}
	if address.Is6() {
		value := address.As16()
		return certificate.owns(OwnershipThingIPv6, value[:])
	}
	return false
}

// owns compares one typed ownership claim with value.
func (certificate CertificateOfOwnership) owns(thingType OwnershipThingType, value []byte) bool {
	for _, thing := range certificate.Things {
		if thing.Type == thingType && len(value) <= len(thing.Value) {
			match := true
			for i := range value {
				if thing.Value[i] != value[i] {
					match = false
					break
				}
			}
			if match {
				return true
			}
		}
	}
	return false
}

// signedData serializes the fields authenticated by the controller signature.
func (certificate CertificateOfOwnership) signedData() []byte {
	data := make([]byte, 0, 8+30+len(certificate.Things)*17+AddressSize*2+2+8)
	data = binary.BigEndian.AppendUint64(data, 0x7f7f7f7f7f7f7f7f)
	data = binary.BigEndian.AppendUint64(data, certificate.NetworkID)
	data = binary.BigEndian.AppendUint64(data, certificate.Timestamp)
	data = binary.BigEndian.AppendUint64(data, certificate.Flags)
	data = binary.BigEndian.AppendUint32(data, certificate.ID)
	data = binary.BigEndian.AppendUint16(data, uint16(len(certificate.Things)))
	for _, thing := range certificate.Things {
		data = append(data, byte(thing.Type))
		data = append(data, thing.Value[:]...)
	}
	issuedTo := certificate.IssuedTo.Bytes()
	signedBy := certificate.SignedBy.Bytes()
	data = append(data, issuedTo[:]...)
	data = append(data, signedBy[:]...)
	data = binary.BigEndian.AppendUint16(data, 0)
	return binary.BigEndian.AppendUint64(data, 0x7f7f7f7f7f7f7f7f)
}

// appendBinary appends the complete ownership certificate wire encoding.
func (certificate CertificateOfOwnership) appendBinary(data []byte) []byte {
	if len(certificate.raw) != 0 {
		return append(data, certificate.raw...)
	}
	data = binary.BigEndian.AppendUint64(data, certificate.NetworkID)
	data = binary.BigEndian.AppendUint64(data, certificate.Timestamp)
	data = binary.BigEndian.AppendUint64(data, certificate.Flags)
	data = binary.BigEndian.AppendUint32(data, certificate.ID)
	data = binary.BigEndian.AppendUint16(data, uint16(len(certificate.Things)))
	for _, thing := range certificate.Things {
		data = append(data, byte(thing.Type))
		data = append(data, thing.Value[:]...)
	}
	issuedTo := certificate.IssuedTo.Bytes()
	signedBy := certificate.SignedBy.Bytes()
	data = append(data, issuedTo[:]...)
	data = append(data, signedBy[:]...)
	data = append(data, 1)
	data = binary.BigEndian.AppendUint16(data, SignatureSize)
	data = append(data, certificate.Signature[:]...)
	return binary.BigEndian.AppendUint16(data, 0)
}
