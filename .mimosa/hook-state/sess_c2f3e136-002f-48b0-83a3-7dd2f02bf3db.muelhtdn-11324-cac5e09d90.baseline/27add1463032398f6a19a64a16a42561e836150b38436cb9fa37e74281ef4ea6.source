// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

package zerotier

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha512"
	"crypto/subtle"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"strings"

	"golang.org/x/crypto/curve25519"
	"golang.org/x/crypto/salsa20/salsa"
)

const (
	// PublicKeySize is the combined size of an identity's X25519 and Ed25519
	// public keys.
	PublicKeySize = 64
	// PrivateKeySize is the combined size of an identity's X25519 and Ed25519
	// private seeds.
	PrivateKeySize = 64
	// SignatureSize is the encoded size of a ZeroTier identity signature.
	SignatureSize = 96
	// SymmetricKeySize is the size of a key agreed between two identities.
	SymmetricKeySize = 48
	// identityHashMemorySize is the scratch memory used by the identity proof of
	// work hash.
	identityHashMemorySize = 2 * 1024 * 1024
	// identityHashThreshold is the maximum accepted leading proof-of-work byte.
	identityHashThreshold = 17
	// serializedIdentitySize is the fixed public portion of a binary identity.
	serializedIdentitySize = AddressSize + 1 + PublicKeySize + 1
)

var (
	// ErrInvalidIdentity reports malformed identity data or failed key validation.
	ErrInvalidIdentity = errors.New("invalid ZeroTier identity")
	// ErrPrivateKey reports an operation that requires a secret identity.
	ErrPrivateKey = errors.New("ZeroTier identity has no private key")
)

// Identity contains the two public keys used by ZeroTier and, optionally,
// their private seeds. Bytes 0..31 are X25519 and bytes 32..63 are Ed25519.
type Identity struct {
	address Address
	public  [PublicKeySize]byte
	private *[PrivateKeySize]byte
}

// GenerateIdentity creates a secret identity satisfying ZeroTier's address
// proof-of-work requirement.
func GenerateIdentity() (Identity, error) {
	var edSeed [32]byte
	if _, err := io.ReadFull(rand.Reader, edSeed[:]); err != nil {
		return Identity{}, err
	}
	edPrivate := ed25519.NewKeyFromSeed(edSeed[:])

	var private [PrivateKeySize]byte
	copy(private[32:], edSeed[:])
	if _, err := io.ReadFull(rand.Reader, private[:32]); err != nil {
		return Identity{}, err
	}

	var public [PublicKeySize]byte
	copy(public[32:], edPrivate[32:])
	for {
		dhPublic, err := curve25519.X25519(private[:32], curve25519.Basepoint)
		if err != nil {
			return Identity{}, err
		}
		copy(public[:32], dhPublic)
		digest := identityMemoryHardHash(public[:])
		address, _ := AddressFromBytes(digest[59:])
		if digest[0] < identityHashThreshold && !address.IsReserved() {
			return Identity{address: address, public: public, private: &private}, nil
		}
		incrementIdentityPrivate(private[:32])
	}
}

// incrementIdentityPrivate advances the identity proof-of-work candidate.
func incrementIdentityPrivate(private []byte) {
	// This follows ECC::generateSatisfying: increment the second native-endian
	// uint64 and decrement the third. ZeroTier's supported targets are little endian.
	binary.LittleEndian.PutUint64(private[8:16], binary.LittleEndian.Uint64(private[8:16])+1)
	binary.LittleEndian.PutUint64(private[16:24], binary.LittleEndian.Uint64(private[16:24])-1)
}

// ParseIdentity decodes and validates ZeroTier's colon-delimited identity form.
func ParseIdentity(s string) (Identity, error) {
	parts := strings.Split(strings.TrimSpace(s), ":")
	if len(parts) != 3 && len(parts) != 4 {
		return Identity{}, ErrInvalidIdentity
	}
	address, err := ParseAddress(parts[0])
	if err != nil || parts[1] != "0" {
		return Identity{}, ErrInvalidIdentity
	}
	publicBytes, err := hex.DecodeString(parts[2])
	if err != nil || len(publicBytes) != PublicKeySize {
		return Identity{}, ErrInvalidIdentity
	}
	id := Identity{address: address}
	copy(id.public[:], publicBytes)
	if len(parts) == 4 {
		privateBytes, err := hex.DecodeString(parts[3])
		if err != nil || len(privateBytes) != PrivateKeySize {
			return Identity{}, ErrInvalidIdentity
		}
		var private [PrivateKeySize]byte
		copy(private[:], privateBytes)
		id.private = &private
		if err := id.validatePrivate(); err != nil {
			return Identity{}, err
		}
	}
	return id, nil
}

// ParseIdentityBinary decodes one binary identity and reports bytes consumed.
func ParseIdentityBinary(b []byte) (Identity, int, error) {
	if len(b) < serializedIdentitySize {
		return Identity{}, 0, ErrInvalidIdentity
	}
	address, err := AddressFromBytes(b[:AddressSize])
	if err != nil || b[AddressSize] != 0 {
		return Identity{}, 0, ErrInvalidIdentity
	}
	id := Identity{address: address}
	pos := AddressSize + 1
	copy(id.public[:], b[pos:pos+PublicKeySize])
	pos += PublicKeySize
	privateLen := int(b[pos])
	pos++
	if privateLen != 0 {
		if privateLen != PrivateKeySize || len(b) < pos+privateLen {
			return Identity{}, 0, ErrInvalidIdentity
		}
		var private [PrivateKeySize]byte
		copy(private[:], b[pos:pos+privateLen])
		id.private = &private
		pos += privateLen
		if err := id.validatePrivate(); err != nil {
			return Identity{}, 0, err
		}
	}
	return id, pos, nil
}

// Address returns the node address derived from the public identity.
func (id Identity) Address() Address { return id.address }

// HasPrivate reports whether id includes its secret key material.
func (id Identity) HasPrivate() bool { return id.private != nil }

// PublicKey returns a copy of the combined X25519 and Ed25519 public keys.
func (id Identity) PublicKey() [PublicKeySize]byte { return id.public }

// PublicString returns the canonical public identity text form.
func (id Identity) PublicString() string {
	return fmt.Sprintf("%s:0:%x", id.address, id.public)
}

// SecretString returns the canonical secret identity text form, or an empty
// string when private key material is absent.
func (id Identity) SecretString() string {
	if id.private == nil {
		return ""
	}
	return fmt.Sprintf("%s:0:%x:%x", id.address, id.public, *id.private)
}

// AppendBinary appends the public identity and optionally its private key.
func (id Identity) AppendBinary(dst []byte, includePrivate bool) []byte {
	dst = id.address.AppendTo(dst)
	dst = append(dst, 0)
	dst = append(dst, id.public[:]...)
	if includePrivate && id.private != nil {
		dst = append(dst, PrivateKeySize)
		dst = append(dst, id.private[:]...)
	} else {
		dst = append(dst, 0)
	}
	return dst
}

// Validate verifies the address proof of work and any included private key.
func (id Identity) Validate() error {
	if id.address.IsReserved() {
		return ErrInvalidIdentity
	}
	digest := identityMemoryHardHash(id.public[:])
	addressBytes := id.address.Bytes()
	if digest[0] >= identityHashThreshold || subtle.ConstantTimeCompare(digest[59:], addressBytes[:]) != 1 {
		return ErrInvalidIdentity
	}
	return id.validatePrivate()
}

// validatePrivate verifies that the private seeds reproduce both public keys.
func (id Identity) validatePrivate() error {
	if id.private == nil {
		return nil
	}
	dhPublic, err := curve25519.X25519(id.private[:32], curve25519.Basepoint)
	if err != nil || subtle.ConstantTimeCompare(dhPublic, id.public[:32]) != 1 {
		return ErrInvalidIdentity
	}
	edPrivate := ed25519.NewKeyFromSeed(id.private[32:])
	if subtle.ConstantTimeCompare(edPrivate[32:], id.public[32:]) != 1 {
		return ErrInvalidIdentity
	}
	return nil
}

// Agree derives ZeroTier's 48-byte shared secret with peer.
func (id Identity) Agree(peer Identity) ([SymmetricKeySize]byte, error) {
	var key [SymmetricKeySize]byte
	if id.private == nil {
		return key, ErrPrivateKey
	}
	raw, err := curve25519.X25519(id.private[:32], peer.public[:32])
	if err != nil {
		return key, err
	}
	digest := sha512.Sum512(raw)
	copy(key[:], digest[:SymmetricKeySize])
	return key, nil
}

// agreeEphemeral derives an AES key from a protocol-13 ephemeral X25519 key.
func (id Identity) agreeEphemeral(public []byte) ([32]byte, error) {
	var key [32]byte
	if id.private == nil || len(public) != 32 {
		return key, ErrPrivateKey
	}
	raw, err := curve25519.X25519(id.private[:32], public)
	if err != nil {
		return key, err
	}
	digest := sha512.Sum512(raw)
	copy(key[:], digest[:32])
	return key, nil
}

// Sign signs message with the Ed25519 half of a secret identity.
func (id Identity) Sign(message []byte) ([SignatureSize]byte, error) {
	var signature [SignatureSize]byte
	if id.private == nil {
		return signature, ErrPrivateKey
	}
	digest := sha512.Sum512(message)
	private := ed25519.NewKeyFromSeed(id.private[32:])
	copy(signature[:64], ed25519.Sign(private, digest[:32]))
	copy(signature[64:], digest[:32])
	return signature, nil
}

// Verify authenticates a ZeroTier-encoded signature over message.
func (id Identity) Verify(message []byte, signature []byte) bool {
	if len(signature) != SignatureSize {
		return false
	}
	digest := sha512.Sum512(message)
	if subtle.ConstantTimeCompare(signature[64:], digest[:32]) != 1 {
		return false
	}
	return ed25519.Verify(ed25519.PublicKey(id.public[32:]), digest[:32], signature[:64])
}

// identityMemoryHardHash computes the memory-hard digest used to derive and
// validate a ZeroTier address.
func identityMemoryHardHash(public []byte) [64]byte {
	digest := sha512.Sum512(public)
	genmem := make([]byte, identityHashMemorySize)
	var key [32]byte
	var counter [16]byte
	copy(key[:], digest[:32])
	copy(counter[:8], digest[32:40])
	salsa.XORKeyStream(genmem[:64], genmem[:64], &counter, &key)
	streamCounter := uint64(1)
	for i := 64; i < len(genmem); i += 64 {
		binary.LittleEndian.PutUint64(counter[8:], streamCounter)
		salsa.XORKeyStream(genmem[i:i+64], genmem[i-64:i], &counter, &key)
		streamCounter++
	}
	var tmp [8]byte
	for i := 0; i < len(genmem); {
		idx1 := uint(binary.BigEndian.Uint64(genmem[i:])&7) * 8
		i += 8
		idx2 := (uint(binary.BigEndian.Uint64(genmem[i:])) % uint(len(genmem)/8)) * 8
		i += 8
		copy(tmp[:], genmem[idx2:idx2+8])
		copy(genmem[idx2:idx2+8], digest[idx1:idx1+8])
		copy(digest[idx1:idx1+8], tmp[:])
		binary.LittleEndian.PutUint64(counter[8:], streamCounter)
		salsa.XORKeyStream(digest[:], digest[:], &counter, &key)
		streamCounter++
	}
	return digest
}
