// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

package zerotier

import (
	_ "embed"
	"encoding/binary"
	"errors"
	"fmt"
	"net/netip"
	"strconv"
)

const (
	// WorldIDearth is the official world ID of ZeroTier's public Earth planet.
	WorldIDearth = uint64(149604618)
	// worldIDHexSize is the number of hexadecimal characters in a world ID.
	worldIDHexSize = 16
	// maxWorldRoots is the protocol limit for roots in one world definition.
	maxWorldRoots = 4
	// maxRootEndpoints is the protocol limit for endpoints advertised by one
	// world root.
	maxRootEndpoints = 32
)

// WorldType identifies the role of a signed root-server world definition.
type WorldType uint8

const (
	// WorldTypeNull identifies an unset world value.
	WorldTypeNull WorldType = 0
	// WorldTypePlanet identifies the primary root-server world.
	WorldTypePlanet WorldType = 1
	// WorldTypeMoon identifies a federated root-server world that can be orbited.
	WorldTypeMoon WorldType = 127
)

// String returns the stable topology name of t.
func (t WorldType) String() string {
	switch t {
	case WorldTypeNull:
		return "null"
	case WorldTypePlanet:
		return "planet"
	case WorldTypeMoon:
		return "moon"
	default:
		return fmt.Sprintf("world-type(%d)", uint8(t))
	}
}

// MarshalText returns the stable topology name of t for text-based encoders.
func (t WorldType) MarshalText() ([]byte, error) {
	return []byte(t.String()), nil
}

// UnmarshalText parses the stable topology name of a world type.
func (t *WorldType) UnmarshalText(text []byte) error {
	var value WorldType
	switch string(text) {
	case "null":
		value = WorldTypeNull
	case "planet":
		value = WorldTypePlanet
	case "moon":
		value = WorldTypeMoon
	default:
		return fmt.Errorf("invalid ZeroTier world type %q", text)
	}
	*t = value
	return nil
}

// ErrInvalidWorld reports malformed or unverifiable planet or moon data.
var ErrInvalidWorld = errors.New("invalid ZeroTier world")

// defaultPlanetData contains the public ZeroTier Earth trust anchor.
//
//go:embed default_planet.bin
var defaultPlanetData []byte

// World is a signed planet or moon root-server topology definition.
type World struct {
	Type                  WorldType
	ID                    uint64
	Timestamp             uint64
	UpdatesMustBeSignedBy [PublicKeySize]byte
	Signature             [SignatureSize]byte
	Roots                 []WorldRoot
}

// WorldRoot pairs one root identity with its physical endpoints.
type WorldRoot struct {
	Identity  Identity
	Endpoints []netip.AddrPort
}

// ParseOrbit parses a moon world ID and seed node address.
func ParseOrbit(worldText, seedText string) (uint64, Address, error) {
	if len(worldText) != worldIDHexSize {
		return 0, 0, errors.New("ZeroTier orbit world must be a 16-digit hexadecimal ID")
	}
	world, err := strconv.ParseUint(worldText, 16, 64)
	if err != nil || world == 0 {
		return 0, 0, errors.New("invalid ZeroTier orbit world ID")
	}
	seed, err := ParseAddress(seedText)
	if err != nil || seed.IsReserved() {
		return 0, 0, errors.New("ZeroTier orbit seed must be a 10-digit node ID")
	}
	return world, seed, nil
}

// DefaultPlanet parses and validates the embedded public Earth planet.
func DefaultPlanet() (World, error) {
	world, err := ParsePlanet(defaultPlanetData)
	if err != nil {
		return World{}, err
	}
	if world.ID != WorldIDearth {
		return World{}, ErrInvalidWorld
	}
	return world, nil
}

// ParsePlanet parses and validates a complete serialized planet. The returned
// world is a trust anchor; its own signature cannot be authenticated without a
// previously trusted revision, while subsequent updates use its update key.
func ParsePlanet(data []byte) (World, error) {
	world, n, err := ParseWorld(data)
	if err != nil || n != len(data) || world.Type != WorldTypePlanet || world.validateRoots() != nil {
		return World{}, ErrInvalidWorld
	}
	return world, nil
}

// ParseWorld decodes one serialized planet or moon and reports bytes consumed.
func ParseWorld(data []byte) (World, int, error) {
	const fixedSize = 1 + 8 + 8 + PublicKeySize + SignatureSize + 1
	if len(data) < fixedSize {
		return World{}, 0, ErrInvalidWorld
	}
	var world World
	world.Type = WorldType(data[0])
	if world.Type != WorldTypeNull && world.Type != WorldTypePlanet && world.Type != WorldTypeMoon {
		return World{}, 0, ErrInvalidWorld
	}
	pos := 1
	world.ID = binary.BigEndian.Uint64(data[pos:])
	pos += 8
	world.Timestamp = binary.BigEndian.Uint64(data[pos:])
	pos += 8
	copy(world.UpdatesMustBeSignedBy[:], data[pos:pos+PublicKeySize])
	pos += PublicKeySize
	copy(world.Signature[:], data[pos:pos+SignatureSize])
	pos += SignatureSize
	rootCount := int(data[pos])
	pos++
	if rootCount > maxWorldRoots {
		return World{}, 0, ErrInvalidWorld
	}
	world.Roots = make([]WorldRoot, 0, rootCount)
	for i := 0; i < rootCount; i++ {
		identity, n, err := ParseIdentityBinary(data[pos:])
		if err != nil {
			return World{}, 0, ErrInvalidWorld
		}
		pos += n
		if pos >= len(data) {
			return World{}, 0, ErrInvalidWorld
		}
		endpointCount := int(data[pos])
		pos++
		if endpointCount > maxRootEndpoints {
			return World{}, 0, ErrInvalidWorld
		}
		root := WorldRoot{Identity: identity, Endpoints: make([]netip.AddrPort, 0, endpointCount)}
		for j := 0; j < endpointCount; j++ {
			endpoint, n, err := parseInetAddress(data[pos:])
			if err != nil || !endpoint.IsValid() {
				return World{}, 0, ErrInvalidWorld
			}
			pos += n
			root.Endpoints = append(root.Endpoints, endpoint)
		}
		world.Roots = append(world.Roots, root)
	}
	if world.Type == WorldTypeMoon {
		if len(data)-pos < 2 {
			return World{}, 0, ErrInvalidWorld
		}
		dictionaryLength := int(binary.BigEndian.Uint16(data[pos:]))
		pos += 2
		if len(data)-pos < dictionaryLength {
			return World{}, 0, ErrInvalidWorld
		}
		pos += dictionaryLength
	}
	return world, pos, nil
}

// AppendTo serializes a world in the ZeroTier wire format. When forSign is
// true the signature is omitted and the domain-separation markers used by
// ZeroTier's World::serialize are included.
func (w World) AppendTo(dst []byte, forSign bool) ([]byte, error) {
	if w.Type != WorldTypeNull && w.Type != WorldTypePlanet && w.Type != WorldTypeMoon {
		return nil, ErrInvalidWorld
	}
	if len(w.Roots) > maxWorldRoots {
		return nil, ErrInvalidWorld
	}
	if forSign {
		dst = binary.BigEndian.AppendUint64(dst, 0x7f7f7f7f7f7f7f7f)
	}
	dst = append(dst, byte(w.Type))
	dst = binary.BigEndian.AppendUint64(dst, w.ID)
	dst = binary.BigEndian.AppendUint64(dst, w.Timestamp)
	dst = append(dst, w.UpdatesMustBeSignedBy[:]...)
	if !forSign {
		dst = append(dst, w.Signature[:]...)
	}
	dst = append(dst, byte(len(w.Roots)))
	for _, root := range w.Roots {
		if len(root.Endpoints) > maxRootEndpoints || root.Identity.Address().IsReserved() {
			return nil, ErrInvalidWorld
		}
		dst = root.Identity.AppendBinary(dst, false)
		dst = append(dst, byte(len(root.Endpoints)))
		for _, endpoint := range root.Endpoints {
			if !endpoint.IsValid() || endpoint.Port() == 0 {
				return nil, ErrInvalidWorld
			}
			dst = appendInetAddress(dst, endpoint)
		}
	}
	if w.Type == WorldTypeMoon {
		dst = append(dst, 0, 0) // attached dictionaries are reserved for future use
	}
	if forSign {
		dst = binary.BigEndian.AppendUint64(dst, 0xf7f7f7f7f7f7f7f7)
	}
	return dst, nil
}

// Serialize returns the complete binary encoding of w.
func (w World) Serialize() ([]byte, error) {
	return w.AppendTo(nil, false)
}

// ShouldBeReplacedBy authenticates a newer revision with the signing key from
// the current world. The initial world is a trust anchor and is handled by the
// caller rather than accepted here.
func (w World) ShouldBeReplacedBy(update World) bool {
	if w.Type == WorldTypeNull || w.ID == 0 || w.ID != update.ID || w.Type != update.Type || update.Timestamp <= w.Timestamp {
		return false
	}
	message, err := update.AppendTo(nil, true)
	if err != nil {
		return false
	}
	signer := Identity{public: w.UpdatesMustBeSignedBy}
	return signer.Verify(message, update.Signature[:])
}

// validateRoots verifies root count, identities, and physical endpoints.
func (w World) validateRoots() error {
	if w.ID == 0 || (w.Type != WorldTypePlanet && w.Type != WorldTypeMoon) || len(w.Roots) == 0 || len(w.Roots) > maxWorldRoots {
		return ErrInvalidWorld
	}
	seen := make(map[Address]struct{}, len(w.Roots))
	for _, root := range w.Roots {
		if len(root.Endpoints) > maxRootEndpoints {
			return ErrInvalidWorld
		}
		if _, ok := seen[root.Identity.Address()]; ok {
			return ErrInvalidWorld
		}
		seen[root.Identity.Address()] = struct{}{}
		if err := root.Identity.Validate(); err != nil {
			return ErrInvalidWorld
		}
		for _, endpoint := range root.Endpoints {
			if !endpoint.IsValid() || endpoint.Port() == 0 {
				return ErrInvalidWorld
			}
		}
	}
	return nil
}

// parseInetAddress decodes ZeroTier's tagged IPv4 or IPv6 endpoint form.
func parseInetAddress(data []byte) (netip.AddrPort, int, error) {
	if len(data) < 1 {
		return netip.AddrPort{}, 0, ErrInvalidWorld
	}
	switch data[0] {
	case 0:
		return netip.AddrPort{}, 1, nil
	case 4:
		if len(data) < 7 {
			return netip.AddrPort{}, 0, ErrInvalidWorld
		}
		var ip [4]byte
		copy(ip[:], data[1:5])
		return netip.AddrPortFrom(netip.AddrFrom4(ip), binary.BigEndian.Uint16(data[5:7])), 7, nil
	case 6:
		if len(data) < 19 {
			return netip.AddrPort{}, 0, ErrInvalidWorld
		}
		var ip [16]byte
		copy(ip[:], data[1:17])
		return netip.AddrPortFrom(netip.AddrFrom16(ip), binary.BigEndian.Uint16(data[17:19])), 19, nil
	default:
		return netip.AddrPort{}, 0, ErrInvalidWorld
	}
}

// appendInetAddress appends ZeroTier's tagged endpoint representation to dst.
func appendInetAddress(dst []byte, address netip.AddrPort) []byte {
	if !address.IsValid() {
		return append(dst, 0)
	}
	if address.Addr().Is4() {
		ip := address.Addr().As4()
		dst = append(dst, 4)
		dst = append(dst, ip[:]...)
	} else {
		ip := address.Addr().As16()
		dst = append(dst, 6)
		dst = append(dst, ip[:]...)
	}
	var port [2]byte
	binary.BigEndian.PutUint16(port[:], address.Port())
	return append(dst, port[:]...)
}
