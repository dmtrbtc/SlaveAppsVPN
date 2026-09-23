// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

package zerotier

import "encoding/binary"

// maxNetworkTags is the protocol limit for tags in one network configuration.
const maxNetworkTags = 128

// Tag is a controller-signed network-scoped integer attribute.
type Tag struct {
	NetworkID uint64
	Timestamp uint64
	ID        uint32
	Value     uint32
	IssuedTo  Address
	SignedBy  Address
	Signature [SignatureSize]byte
	raw       []byte
}

// ParseTag decodes one signed network tag and reports the number of bytes
// consumed.
func ParseTag(data []byte) (Tag, int, error) {
	const fixedSize = 8 + 8 + 4 + 4 + AddressSize*2
	if len(data) < fixedSize+3+SignatureSize+2 {
		return Tag{}, 0, ErrInvalidPacket
	}
	tag := Tag{
		NetworkID: binary.BigEndian.Uint64(data),
		Timestamp: binary.BigEndian.Uint64(data[8:]),
		ID:        binary.BigEndian.Uint32(data[16:]),
		Value:     binary.BigEndian.Uint32(data[20:]),
	}
	pos := 24
	var err error
	tag.IssuedTo, err = AddressFromBytes(data[pos : pos+AddressSize])
	if err != nil {
		return Tag{}, 0, err
	}
	pos += AddressSize
	tag.SignedBy, err = AddressFromBytes(data[pos : pos+AddressSize])
	if err != nil {
		return Tag{}, 0, err
	}
	pos += AddressSize
	if data[pos] != 1 || int(binary.BigEndian.Uint16(data[pos+1:])) != SignatureSize {
		return Tag{}, 0, ErrInvalidPacket
	}
	pos += 3
	copy(tag.Signature[:], data[pos:pos+SignatureSize])
	pos += SignatureSize
	extensionLength := int(binary.BigEndian.Uint16(data[pos:]))
	pos += 2
	if len(data)-pos < extensionLength {
		return Tag{}, 0, ErrInvalidPacket
	}
	pos += extensionLength
	tag.raw = append([]byte(nil), data[:pos]...)
	return tag, pos, nil
}

// Verify authenticates tag with its network controller identity.
func (tag Tag) Verify(controller Identity) bool {
	return tag.NetworkID != 0 && !tag.IssuedTo.IsZero() && tag.SignedBy == Controller(tag.NetworkID) &&
		controller.Address() == tag.SignedBy && controller.Verify(tag.signedData(), tag.Signature[:])
}

// signedData serializes the fields authenticated by the controller signature.
func (tag Tag) signedData() []byte {
	data := make([]byte, 0, 8+24+AddressSize*2+2+8)
	data = binary.BigEndian.AppendUint64(data, 0x7f7f7f7f7f7f7f7f)
	data = binary.BigEndian.AppendUint64(data, tag.NetworkID)
	data = binary.BigEndian.AppendUint64(data, tag.Timestamp)
	data = binary.BigEndian.AppendUint32(data, tag.ID)
	data = binary.BigEndian.AppendUint32(data, tag.Value)
	issuedTo := tag.IssuedTo.Bytes()
	signedBy := tag.SignedBy.Bytes()
	data = append(data, issuedTo[:]...)
	data = append(data, signedBy[:]...)
	data = binary.BigEndian.AppendUint16(data, 0)
	return binary.BigEndian.AppendUint64(data, 0x7f7f7f7f7f7f7f7f)
}

// appendBinary appends the complete tag wire encoding.
func (tag Tag) appendBinary(data []byte) []byte {
	if len(tag.raw) != 0 {
		return append(data, tag.raw...)
	}
	data = binary.BigEndian.AppendUint64(data, tag.NetworkID)
	data = binary.BigEndian.AppendUint64(data, tag.Timestamp)
	data = binary.BigEndian.AppendUint32(data, tag.ID)
	data = binary.BigEndian.AppendUint32(data, tag.Value)
	issuedTo := tag.IssuedTo.Bytes()
	signedBy := tag.SignedBy.Bytes()
	data = append(data, issuedTo[:]...)
	data = append(data, signedBy[:]...)
	data = append(data, 1)
	data = binary.BigEndian.AppendUint16(data, SignatureSize)
	data = append(data, tag.Signature[:]...)
	return binary.BigEndian.AppendUint16(data, 0)
}
