// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

package zerotier

import "encoding/binary"

const (
	// maxNetworkCapabilities is the protocol limit for capabilities in one
	// network configuration.
	maxNetworkCapabilities = 128
	// maxCapabilityRules is the maximum number of rules in one capability.
	maxCapabilityRules = 64
	// maxCapabilityCustody is the maximum supported custody-chain length.
	maxCapabilityCustody = 7
)

// CapabilityCustody is one signed delegation link in a capability chain.
type CapabilityCustody struct {
	To        Address
	From      Address
	Signature [SignatureSize]byte
}

// Capability grants its final custodian a signed set of network rules.
type Capability struct {
	NetworkID             uint64
	Timestamp             uint64
	ID                    uint32
	Rules                 []NetworkRule
	MaxCustodyChainLength uint8
	Custody               []CapabilityCustody
	raw                   []byte
}

// ParseCapability decodes one capability and reports the number of bytes
// consumed.
func ParseCapability(data []byte) (Capability, int, error) {
	if len(data) < 23 {
		return Capability{}, 0, ErrInvalidPacket
	}
	capability := Capability{
		NetworkID: binary.BigEndian.Uint64(data),
		Timestamp: binary.BigEndian.Uint64(data[8:]),
		ID:        binary.BigEndian.Uint32(data[16:]),
	}
	ruleCount := int(binary.BigEndian.Uint16(data[20:]))
	if ruleCount > maxCapabilityRules {
		return Capability{}, 0, ErrInvalidPacket
	}
	pos := 22
	for i := 0; i < ruleCount; i++ {
		if len(data)-pos < 2 {
			return Capability{}, 0, ErrInvalidPacket
		}
		fieldLength := int(data[pos+1])
		if len(data)-pos-2 < fieldLength {
			return Capability{}, 0, ErrInvalidPacket
		}
		capability.Rules = append(capability.Rules, NetworkRule{Type: data[pos], Value: append([]byte(nil), data[pos+2:pos+2+fieldLength]...)})
		pos += 2 + fieldLength
	}
	if len(data)-pos < 1 {
		return Capability{}, 0, ErrInvalidPacket
	}
	capability.MaxCustodyChainLength = data[pos]
	pos++
	if capability.MaxCustodyChainLength < 1 || capability.MaxCustodyChainLength > maxCapabilityCustody {
		return Capability{}, 0, ErrInvalidPacket
	}
	for {
		if len(data)-pos < AddressSize {
			return Capability{}, 0, ErrInvalidPacket
		}
		to, err := AddressFromBytes(data[pos : pos+AddressSize])
		if err != nil {
			return Capability{}, 0, err
		}
		pos += AddressSize
		if to.IsZero() {
			break
		}
		if len(capability.Custody) >= int(capability.MaxCustodyChainLength) || len(data)-pos < AddressSize+3+SignatureSize {
			return Capability{}, 0, ErrInvalidPacket
		}
		from, err := AddressFromBytes(data[pos : pos+AddressSize])
		if err != nil || from.IsZero() {
			return Capability{}, 0, ErrInvalidPacket
		}
		pos += AddressSize
		if data[pos] != 1 || int(binary.BigEndian.Uint16(data[pos+1:])) != SignatureSize {
			return Capability{}, 0, ErrInvalidPacket
		}
		pos += 3
		custody := CapabilityCustody{To: to, From: from}
		copy(custody.Signature[:], data[pos:pos+SignatureSize])
		pos += SignatureSize
		capability.Custody = append(capability.Custody, custody)
	}
	if len(data)-pos < 2 {
		return Capability{}, 0, ErrInvalidPacket
	}
	extensionLength := int(binary.BigEndian.Uint16(data[pos:]))
	pos += 2
	if len(data)-pos < extensionLength {
		return Capability{}, 0, ErrInvalidPacket
	}
	pos += extensionLength
	capability.raw = append([]byte(nil), data[:pos]...)
	return capability, pos, nil
}

// IssuedTo returns the final custodian or the zero address for an empty chain.
func (capability Capability) IssuedTo() Address {
	if len(capability.Custody) == 0 {
		return 0
	}
	return capability.Custody[len(capability.Custody)-1].To
}

// Verify authenticates the complete custody chain with identityFor.
func (capability Capability) Verify(identityFor func(Address) (Identity, bool)) bool {
	_, valid := capability.verify(identityFor)
	return valid
}

// verify authenticates custody and reports the first missing signer identity.
func (capability Capability) verify(identityFor func(Address) (Identity, bool)) (Address, bool) {
	if capability.MaxCustodyChainLength < 1 || capability.MaxCustodyChainLength > maxCapabilityCustody || len(capability.Custody) == 0 || len(capability.Custody) > int(capability.MaxCustodyChainLength) {
		return 0, false
	}
	signedData := capability.signedData()
	for i, custody := range capability.Custody {
		if i == 0 {
			if custody.From != Controller(capability.NetworkID) {
				return 0, false
			}
		} else if custody.From != capability.Custody[i-1].To {
			return 0, false
		}
		identity, ok := identityFor(custody.From)
		if !ok {
			return custody.From, false
		}
		if !identity.Verify(signedData, custody.Signature[:]) {
			return 0, false
		}
	}
	return 0, true
}

// signedData returns the protocol bytes authenticated by each custodian.
func (capability Capability) signedData() []byte {
	data := make([]byte, 0, 64)
	data = binary.BigEndian.AppendUint64(data, 0x7f7f7f7f7f7f7f7f)
	data = appendCapabilityBase(data, capability)
	data = binary.BigEndian.AppendUint16(data, 0)
	return binary.BigEndian.AppendUint64(data, 0x7f7f7f7f7f7f7f7f)
}

// appendBinary appends the complete wire encoding of capability to data.
func (capability Capability) appendBinary(data []byte) []byte {
	if len(capability.raw) != 0 {
		return append(data, capability.raw...)
	}
	data = appendCapabilityBase(data, capability)
	for _, custody := range capability.Custody {
		to := custody.To.Bytes()
		from := custody.From.Bytes()
		data = append(data, to[:]...)
		data = append(data, from[:]...)
		data = append(data, 1)
		data = binary.BigEndian.AppendUint16(data, SignatureSize)
		data = append(data, custody.Signature[:]...)
	}
	data = append(data, make([]byte, AddressSize)...)
	return binary.BigEndian.AppendUint16(data, 0)
}

// appendCapabilityBase serializes the unsigned fixed fields and rule list.
func appendCapabilityBase(data []byte, capability Capability) []byte {
	data = binary.BigEndian.AppendUint64(data, capability.NetworkID)
	data = binary.BigEndian.AppendUint64(data, capability.Timestamp)
	data = binary.BigEndian.AppendUint32(data, capability.ID)
	data = binary.BigEndian.AppendUint16(data, uint16(len(capability.Rules)))
	for _, rule := range capability.Rules {
		data = append(data, rule.Type, byte(len(rule.Value)))
		data = append(data, rule.Value...)
	}
	return append(data, capability.MaxCustodyChainLength)
}
