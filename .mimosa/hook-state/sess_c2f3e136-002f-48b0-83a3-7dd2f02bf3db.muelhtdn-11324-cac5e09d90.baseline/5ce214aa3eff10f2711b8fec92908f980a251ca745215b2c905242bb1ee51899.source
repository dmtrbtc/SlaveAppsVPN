// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

package zerotier

import (
	"encoding/hex"
	"errors"
	"fmt"
)

const (
	// AddressSize is the encoded size of a 40-bit ZeroTier node address.
	AddressSize = 5
	// addressMask retains the low 40 bits used by a ZeroTier node address.
	addressMask = uint64(0xffffffffff)
	// reservedPrefix identifies the 0xff-prefixed reserved address namespace.
	reservedPrefix = byte(0xff)
	// NetworkIDHexSize is the number of hexadecimal characters in a network ID.
	NetworkIDHexSize = 16
	// AddressHexSize is the number of hexadecimal characters in a node address.
	AddressHexSize = 10
	// EthernetMACSize is the encoded size of an Ethernet MAC address.
	EthernetMACSize = 6
)

var (
	// ErrInvalidAddress reports a malformed or reserved ZeroTier node address.
	ErrInvalidAddress = errors.New("invalid ZeroTier address")
	// ErrInvalidNetworkID reports a malformed network identifier or controller
	// address.
	ErrInvalidNetworkID = errors.New("invalid ZeroTier network ID")
)

// Address is a 40-bit ZeroTier node address.
type Address uint64

// NewAddress constructs a node address from the low 40 bits of v.
func NewAddress(v uint64) Address {
	return Address(v & addressMask)
}

// ParseAddress parses a ten-character hexadecimal ZeroTier node address.
func ParseAddress(s string) (Address, error) {
	if len(s) != AddressHexSize {
		return 0, ErrInvalidAddress
	}
	var raw [AddressSize]byte
	if _, err := hex.Decode(raw[:], []byte(s)); err != nil {
		return 0, fmt.Errorf("%w: %v", ErrInvalidAddress, err)
	}
	address, err := AddressFromBytes(raw[:])
	if err != nil || address.IsReserved() {
		return 0, ErrInvalidAddress
	}
	return address, nil
}

// ParseNetworkID parses a 64-bit ZeroTier network ID and validates its encoded
// controller address.
func ParseNetworkID(s string) (uint64, error) {
	if len(s) != NetworkIDHexSize {
		return 0, ErrInvalidNetworkID
	}
	var raw [NetworkIDHexSize / 2]byte
	if _, err := hex.Decode(raw[:], []byte(s)); err != nil {
		return 0, fmt.Errorf("%w: %v", ErrInvalidNetworkID, err)
	}
	var networkID uint64
	for _, value := range raw {
		networkID = networkID<<8 | uint64(value)
	}
	if networkID == 0 || (!IsAdHocNetworkID(networkID) && Controller(networkID).IsReserved()) {
		return 0, ErrInvalidNetworkID
	}
	return networkID, nil
}

// IsAdHocNetworkID reports whether networkID is in ZeroTier's controllerless
// 0xff-prefixed network namespace.
func IsAdHocNetworkID(networkID uint64) bool {
	return networkID>>56 == 0xff
}

// AddressFromBytes decodes a five-byte big-endian ZeroTier node address.
func AddressFromBytes(b []byte) (Address, error) {
	if len(b) != AddressSize {
		return 0, ErrInvalidAddress
	}
	var v uint64
	for _, c := range b {
		v = (v << 8) | uint64(c)
	}
	return Address(v), nil
}

// Uint64 returns the canonical low 40 bits of a.
func (a Address) Uint64() uint64 {
	return uint64(a) & addressMask
}

// IsZero reports whether a is the unspecified node address.
func (a Address) IsZero() bool {
	return a.Uint64() == 0
}

// IsReserved reports whether a cannot identify an ordinary node.
func (a Address) IsReserved() bool {
	return a.IsZero() || byte(a.Uint64()>>32) == reservedPrefix
}

// String formats a as ten lowercase hexadecimal digits.
func (a Address) String() string {
	return fmt.Sprintf("%010x", a.Uint64())
}

// AppendTo appends the five-byte big-endian representation of a to dst.
func (a Address) AppendTo(dst []byte) []byte {
	v := a.Uint64()
	return append(dst, byte(v>>32), byte(v>>24), byte(v>>16), byte(v>>8), byte(v))
}

// Bytes returns the five-byte big-endian representation of a.
func (a Address) Bytes() [AddressSize]byte {
	v := a.Uint64()
	return [AddressSize]byte{byte(v >> 32), byte(v >> 24), byte(v >> 16), byte(v >> 8), byte(v)}
}

// Controller returns the controller address encoded in a network ID.
func Controller(networkID uint64) Address {
	return NewAddress(networkID >> 24)
}
