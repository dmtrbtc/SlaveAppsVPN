// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

package zerotier

import (
	"errors"
	"fmt"
)

// MACFromBytes decodes the first six bytes of data as an Ethernet MAC address.
func MACFromBytes(data []byte) (MAC, error) {
	if len(data) < EthernetMACSize {
		return 0, errors.New("invalid Ethernet MAC")
	}
	return NewMAC(uint64(data[0])<<40 | uint64(data[1])<<32 | uint64(data[2])<<24 | uint64(data[3])<<16 | uint64(data[4])<<8 | uint64(data[5])), nil
}

// MAC is a 48-bit Ethernet address stored in host byte order.
type MAC uint64

// NewMAC constructs an Ethernet address from the low 48 bits of v.
func NewMAC(v uint64) MAC {
	return MAC(v & 0xffffffffffff)
}

// MACForAddress derives ZeroTier's deterministic virtual MAC for a node and
// network.
func MACForAddress(address Address, networkID uint64) MAC {
	m := uint64(firstMACOctet(networkID)) << 40
	m |= address.Uint64()
	m ^= ((networkID >> 8) & 0xff) << 32
	m ^= ((networkID >> 16) & 0xff) << 24
	m ^= ((networkID >> 24) & 0xff) << 16
	m ^= ((networkID >> 32) & 0xff) << 8
	m ^= (networkID >> 40) & 0xff
	return NewMAC(m)
}

// firstMACOctet derives the locally administered first octet for a network.
func firstMACOctet(networkID uint64) byte {
	b := byte(networkID&0xfe) | 0x02
	if b == 0x52 {
		return 0x32
	}
	return b
}

// Uint64 returns the canonical low 48 bits of m.
func (m MAC) Uint64() uint64 {
	return uint64(m) & 0xffffffffffff
}

// Address reverses the deterministic network-specific virtual MAC mapping.
func (m MAC) Address(networkID uint64) Address {
	a := m.Uint64() & addressMask
	a ^= ((networkID >> 8) & 0xff) << 32
	a ^= ((networkID >> 16) & 0xff) << 24
	a ^= ((networkID >> 24) & 0xff) << 16
	a ^= ((networkID >> 32) & 0xff) << 8
	a ^= (networkID >> 40) & 0xff
	return NewAddress(a)
}

// IsBroadcast reports whether m is the Ethernet broadcast address.
func (m MAC) IsBroadcast() bool {
	return m.Uint64() == 0xffffffffffff
}

// IsMulticast reports whether m has the Ethernet group bit set.
func (m MAC) IsMulticast() bool {
	return m.Uint64()&0x010000000000 != 0
}

// String formats m in colon-separated hexadecimal notation.
func (m MAC) String() string {
	v := m.Uint64()
	return fmt.Sprintf("%02x:%02x:%02x:%02x:%02x:%02x", byte(v>>40), byte(v>>32), byte(v>>24), byte(v>>16), byte(v>>8), byte(v))
}

// Bytes returns the six-byte network-order representation of m.
func (m MAC) Bytes() [EthernetMACSize]byte {
	v := m.Uint64()
	return [EthernetMACSize]byte{byte(v >> 40), byte(v >> 32), byte(v >> 24), byte(v >> 16), byte(v >> 8), byte(v)}
}
