// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

package zerotier

import (
	"encoding/binary"
	"net/netip"
)

// RFC4193Address returns ZeroTier's RFC4193-style managed IPv6 address.
func RFC4193Address(networkID uint64, address Address) netip.Prefix {
	var raw [16]byte
	raw[0] = 0xfd
	binary.BigEndian.PutUint64(raw[1:9], networkID)
	raw[9], raw[10] = 0x99, 0x93
	node := address.Bytes()
	copy(raw[11:], node[:])
	return netip.PrefixFrom(netip.AddrFrom16(raw), 88)
}

// AddressFromRFC4193 extracts a node address from a ZeroTier RFC4193 address.
func AddressFromRFC4193(networkID uint64, ip netip.Addr) (Address, bool) {
	if !ip.Is6() {
		return 0, false
	}
	raw := ip.As16()
	if raw[0] != 0xfd || binary.BigEndian.Uint64(raw[1:9]) != networkID || raw[9] != 0x99 || raw[10] != 0x93 {
		return 0, false
	}
	address, err := AddressFromBytes(raw[11:])
	return address, err == nil && !address.IsReserved()
}

// SixPlaneAddress returns ZeroTier's 6plane managed IPv6 address.
func SixPlaneAddress(networkID uint64, address Address) netip.Prefix {
	var raw [16]byte
	raw[0] = 0xfc
	binary.BigEndian.PutUint32(raw[1:5], uint32(networkID^(networkID>>32)))
	node := address.Bytes()
	copy(raw[5:10], node[:])
	raw[15] = 1
	return netip.PrefixFrom(netip.AddrFrom16(raw), 40)
}

// AddressFromSixPlane extracts a node address from a ZeroTier 6plane address.
func AddressFromSixPlane(networkID uint64, ip netip.Addr) (Address, bool) {
	if !ip.Is6() {
		return 0, false
	}
	raw := ip.As16()
	if raw[0] != 0xfc || binary.BigEndian.Uint32(raw[1:5]) != uint32(networkID^(networkID>>32)) {
		return 0, false
	}
	address, err := AddressFromBytes(raw[5:10])
	return address, err == nil && !address.IsReserved()
}
