// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

package zerotier

import (
	"crypto/sha512"
	"encoding/binary"
	"encoding/hex"
	"sort"
	"strings"
)

// maxCOMQualifiers is the protocol limit for qualifiers in a membership
// certificate.
const maxCOMQualifiers = 8

// COMQualifier is one signed constraint in a certificate of membership.
type COMQualifier struct {
	ID       uint64
	Value    uint64
	MaxDelta uint64
}

// CertificateOfMembership proves that a node is authorized on a private
// network. It is signed by the network controller.
type CertificateOfMembership struct {
	Qualifiers []COMQualifier
	SignedBy   Address
	Signature  [SignatureSize]byte
	raw        []byte
}

// ParseCertificateOfMembership decodes one binary membership certificate and
// reports the number of bytes consumed.
func ParseCertificateOfMembership(data []byte) (CertificateOfMembership, int, error) {
	if len(data) < 3 || data[0] != 1 {
		return CertificateOfMembership{}, 0, ErrInvalidPacket
	}
	count := int(binary.BigEndian.Uint16(data[1:3]))
	if count == 0 || count > maxCOMQualifiers {
		return CertificateOfMembership{}, 0, ErrInvalidPacket
	}
	length := 3 + count*24 + AddressSize
	if len(data) < length {
		return CertificateOfMembership{}, 0, ErrInvalidPacket
	}
	certificate := CertificateOfMembership{Qualifiers: make([]COMQualifier, 0, count)}
	pos := 3
	var lastID uint64
	for i := 0; i < count; i++ {
		qualifier := COMQualifier{
			ID:       binary.BigEndian.Uint64(data[pos:]),
			Value:    binary.BigEndian.Uint64(data[pos+8:]),
			MaxDelta: binary.BigEndian.Uint64(data[pos+16:]),
		}
		if i > 0 && qualifier.ID < lastID {
			return CertificateOfMembership{}, 0, ErrInvalidPacket
		}
		lastID = qualifier.ID
		certificate.Qualifiers = append(certificate.Qualifiers, qualifier)
		pos += 24
	}
	var err error
	certificate.SignedBy, err = AddressFromBytes(data[pos : pos+AddressSize])
	if err != nil {
		return CertificateOfMembership{}, 0, err
	}
	pos += AddressSize
	if !certificate.SignedBy.IsZero() {
		if len(data)-pos < SignatureSize {
			return CertificateOfMembership{}, 0, ErrInvalidPacket
		}
		copy(certificate.Signature[:], data[pos:pos+SignatureSize])
		pos += SignatureSize
	}
	certificate.raw = append([]byte(nil), data[:pos]...)
	return certificate, pos, nil
}

// parseCertificateOfMembershipString decodes the legacy text certificate form.
func parseCertificateOfMembershipString(value string) (CertificateOfMembership, error) {
	if nul := strings.IndexByte(value, 0); nul >= 0 {
		value = value[:nul]
	}
	parts := strings.SplitN(value, ":", 5)
	if len(parts) < 3 || parts[0] != "1" || len(parts[1]) == 0 {
		return CertificateOfMembership{}, ErrInvalidPacket
	}
	qualifierData, err := hex.DecodeString(parts[1])
	if err != nil || len(qualifierData)%24 != 0 || len(qualifierData)/24 > maxCOMQualifiers {
		return CertificateOfMembership{}, ErrInvalidPacket
	}
	qualifiers := make([]COMQualifier, 0, len(qualifierData)/24)
	for pos := 0; pos < len(qualifierData); pos += 24 {
		qualifiers = append(qualifiers, COMQualifier{
			ID:       binary.BigEndian.Uint64(qualifierData[pos:]),
			Value:    binary.BigEndian.Uint64(qualifierData[pos+8:]),
			MaxDelta: binary.BigEndian.Uint64(qualifierData[pos+16:]),
		})
	}
	sort.SliceStable(qualifiers, func(i, j int) bool { return qualifiers[i].ID < qualifiers[j].ID })
	unique := qualifiers[:0]
	for _, qualifier := range qualifiers {
		if len(unique) == 0 || unique[len(unique)-1].ID != qualifier.ID {
			unique = append(unique, qualifier)
		}
	}
	if len(unique) == 0 {
		return CertificateOfMembership{}, ErrInvalidPacket
	}
	signer, err := ParseAddress(parts[2])
	if err != nil {
		return CertificateOfMembership{}, ErrInvalidPacket
	}
	certificate := CertificateOfMembership{Qualifiers: unique, SignedBy: signer}
	if !signer.IsZero() {
		if len(parts) < 4 || len(parts[3]) != SignatureSize*2 {
			return CertificateOfMembership{}, ErrInvalidPacket
		}
		if _, err = hex.Decode(certificate.Signature[:], []byte(parts[3])); err != nil {
			return CertificateOfMembership{}, ErrInvalidPacket
		}
	}
	certificate.raw = []byte{1, 0, byte(len(certificate.Qualifiers))}
	certificate.raw = append(certificate.raw, certificate.signedData()...)
	signerBytes := signer.Bytes()
	certificate.raw = append(certificate.raw, signerBytes[:]...)
	if !signer.IsZero() {
		certificate.raw = append(certificate.raw, certificate.Signature[:]...)
	}
	return certificate, nil
}

// Bytes returns an independently owned copy of the certificate wire encoding.
func (c CertificateOfMembership) Bytes() []byte {
	return append([]byte(nil), c.raw...)
}

// Timestamp returns the standard timestamp qualifier.
func (c CertificateOfMembership) Timestamp() uint64 {
	return c.qualifierValue(0)
}

// NetworkID returns the standard network qualifier.
func (c CertificateOfMembership) NetworkID() uint64 {
	return c.qualifierValue(1)
}

// IssuedTo returns the standard member-address qualifier.
func (c CertificateOfMembership) IssuedTo() Address {
	return NewAddress(c.qualifierValue(2))
}

// Verify authenticates c with the network controller identity.
func (c CertificateOfMembership) Verify(controller Identity) bool {
	if c.SignedBy.IsZero() || c.SignedBy != controller.Address() || c.SignedBy != Controller(c.NetworkID()) {
		return false
	}
	return controller.Verify(c.signedData(), c.Signature[:])
}

// AgreesWith applies the same qualifier comparison used by ZeroTier One. A
// node's own COM acts as the network's membership template for remote COMs.
func (c CertificateOfMembership) AgreesWith(other CertificateOfMembership, otherIdentity Identity) bool {
	return c.agreesWithPublicKeyHash(other, otherIdentity.publicKeyHash())
}

// agreesWithPublicKeyHash compares two certificates using a precomputed
// SHA-384 digest of the other member's public identity.
func (c CertificateOfMembership) agreesWithPublicKeyHash(other CertificateOfMembership, otherPublicKeyHash [48]byte) bool {
	if len(c.Qualifiers) == 0 || len(other.Qualifiers) == 0 {
		return false
	}
	checkIdentityHash := false
	for _, qualifier := range c.Qualifiers {
		value, ok := qualifierValue(other.Qualifiers, qualifier.ID)
		if !ok || absoluteDifference(qualifier.Value, value) > qualifier.MaxDelta {
			return false
		}
		if qualifier.ID >= 3 && qualifier.ID <= 6 {
			checkIdentityHash = true
		}
	}
	if checkIdentityHash {
		for i := 0; i < 4; i++ {
			value, ok := qualifierValue(other.Qualifiers, uint64(i+3))
			if !ok || value != binary.BigEndian.Uint64(otherPublicKeyHash[i*8:]) {
				return false
			}
		}
	}
	return true
}

// qualifierValue returns the last value for id, matching assignment into the
// map used by ZeroTier One when a malformed certificate repeats an ID.
func qualifierValue(qualifiers []COMQualifier, id uint64) (uint64, bool) {
	for i := len(qualifiers) - 1; i >= 0; i-- {
		if qualifiers[i].ID == id {
			return qualifiers[i].Value, true
		}
	}
	return 0, false
}

// qualifierValue returns a qualifier value or zero when it is absent.
func (c CertificateOfMembership) qualifierValue(id uint64) uint64 {
	for _, qualifier := range c.Qualifiers {
		if qualifier.ID == id {
			return qualifier.Value
		}
	}
	return 0
}

// signedData serializes the qualifier sequence authenticated by the signature.
func (c CertificateOfMembership) signedData() []byte {
	data := make([]byte, 0, len(c.Qualifiers)*24)
	var field [8]byte
	for _, qualifier := range c.Qualifiers {
		binary.BigEndian.PutUint64(field[:], qualifier.ID)
		data = append(data, field[:]...)
		binary.BigEndian.PutUint64(field[:], qualifier.Value)
		data = append(data, field[:]...)
		binary.BigEndian.PutUint64(field[:], qualifier.MaxDelta)
		data = append(data, field[:]...)
	}
	return data
}

// publicKeyHash returns the SHA-384 identity digest used by COM qualifiers.
func (id Identity) publicKeyHash() [48]byte {
	var identity [AddressSize + PublicKeySize]byte
	address := id.address.Bytes()
	copy(identity[:AddressSize], address[:])
	copy(identity[AddressSize:], id.public[:])
	return sha512.Sum384(identity[:])
}

// absoluteDifference returns the unsigned distance between a and b.
func absoluteDifference(a, b uint64) uint64 {
	if a >= b {
		return a - b
	}
	return b - a
}
