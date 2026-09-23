// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

package ztcrypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/sha512"
	"crypto/subtle"
	"encoding/binary"
	"errors"
)

const (
	// gmacSIVMasterKeySize is the ZeroTier shared-secret and HMAC-SHA-384 size.
	gmacSIVMasterKeySize = 48
	// gmacSIVAESKeySize is the AES-256 key size.
	gmacSIVAESKeySize = 32
	// gmacSIVIVSize is the packet ID size before replacement by the opaque value.
	gmacSIVIVSize = 8
	// gmacSIVOpaqueSize is the encrypted IV plus folded authenticator size.
	gmacSIVOpaqueSize = 16
	// gmacSIVFoldedTagSize is the authenticator size after folding the GMAC tag.
	gmacSIVFoldedTagSize = 8
)

// ErrInvalidGMACSIV indicates malformed input or failed authentication.
var ErrInvalidGMACSIV = errors.New("invalid ZeroTier AES-GMAC-SIV data")

// GMACSIVKeys holds the expanded AES keys and reusable workspace for one
// ZeroTier peer secret. Construct it once when the peer is learned and reuse it
// for every packet, as ZeroTier One does. Methods on the same value must not be
// called concurrently.
//
// This is a protocol-specific construction translated from
// AES::GMACSIVEncryptor and AES::GMACSIVDecryptor in ZeroTierOne. Despite the
// name, it is not AES-GCM-SIV as standardized by RFC 8452 and must not be used
// as a general-purpose AEAD.
//
// For a 48-byte shared secret K, 8-byte packet IV, AAD A, and plaintext P:
//
//	K0, K1 = ZeroTier KBKDF-HMAC-SHA-384(K, "ZT0"), (..., "ZT1")
//	T      = GMAC-K0(IV || 0^32, pad16(A) || P)
//	S      = IV || (T[0:8] XOR T[8:16])
//	O      = AES-K1(S)
//	C      = AES-CTR-K1(maskCounterBit(O), P)
//
// O is the 16-byte opaque value carried in the packet's legacy IV and MAC
// fields. Folding T leaves a 64-bit authenticator, so the construction's
// forgery bound is no stronger than 64 bits. Keep this implementation internal
// and byte-for-byte compatible with the ZeroTier wire protocol.
type GMACSIVKeys struct {
	authentication cipher.AEAD
	encryption     cipher.Block
	scratch        []byte
	nonce          [12]byte
	tag            [gmacSIVOpaqueSize]byte
	synthetic      [gmacSIVOpaqueSize]byte
	ctr            [gmacSIVOpaqueSize]byte
	opaque         [gmacSIVOpaqueSize]byte
}

// NewGMACSIVKeys derives and expands the AES-GMAC-SIV keys for a ZeroTier peer
// secret. The returned keys are safe to reuse for their peer's lifetime.
func NewGMACSIVKeys(key []byte) (GMACSIVKeys, error) {
	var keys GMACSIVKeys
	k0, k1, err := deriveGMACSIVKeys(key)
	if err != nil {
		return keys, err
	}
	block0, err := aes.NewCipher(k0[:])
	if err != nil {
		return keys, err
	}
	keys.authentication, err = cipher.NewGCM(block0)
	if err != nil {
		return GMACSIVKeys{}, err
	}
	keys.encryption, err = aes.NewCipher(k1[:])
	if err != nil {
		return GMACSIVKeys{}, err
	}
	return keys, nil
}

// Seal authenticates plaintext and additionalData, encrypts plaintext, and
// appends the ciphertext to dst. To reuse plaintext's storage, pass
// plaintext[:0] as dst. Otherwise, the remaining capacity of dst must not
// overlap plaintext. Seal panics if iv is not eight bytes. The detached opaque
// value replaces the packet IV and authenticator fields on the wire.
func (keys *GMACSIVKeys) Seal(dst, iv, plaintext, additionalData []byte) ([]byte, [gmacSIVOpaqueSize]byte) {
	if len(iv) != gmacSIVIVSize {
		panic("ztcrypto: incorrect GMAC-SIV IV length")
	}
	tag := keys.gmac(iv, additionalData, plaintext)
	// ZeroTier truncates GMAC by XOR-folding its two 64-bit halves, then
	// encrypts IV || folded-tag. This encrypted block is both the synthetic
	// CTR IV and the opaque authenticator transmitted in the packet header.
	folded := foldGMACTag(tag)
	copy(keys.synthetic[:gmacSIVIVSize], iv)
	copy(keys.synthetic[gmacSIVIVSize:], folded[:])
	keys.encryption.Encrypt(keys.opaque[:], keys.synthetic[:])
	copy(keys.ctr[:], keys.opaque[:])
	// Reserve the high bit of the final 32-bit counter field as required by
	// ZeroTier's CTR layout. cipher.NewCTR may increment the full block, but
	// ZeroTier packets are far below the point where that difference matters.
	keys.ctr[12] &= 0x7f
	result, ciphertext := sliceForAppend(dst, len(plaintext))
	cipher.NewCTR(keys.encryption, keys.ctr[:]).XORKeyStream(ciphertext, plaintext)
	return result, keys.opaque
}

// Open decrypts and authenticates ciphertext and additionalData and appends
// the plaintext to dst. To reuse ciphertext's storage, pass ciphertext[:0] as
// dst. Otherwise, the remaining capacity of dst must not overlap ciphertext.
// If authentication fails, Open clears the appended plaintext and returns no
// result.
func (keys *GMACSIVKeys) Open(dst []byte, opaque [gmacSIVOpaqueSize]byte, ciphertext, additionalData []byte) ([]byte, error) {
	// Decrypting O recovers the original packet IV and folded GMAC. O itself,
	// with the counter bit masked, is the CTR starting value.
	keys.encryption.Decrypt(keys.synthetic[:], opaque[:])
	copy(keys.ctr[:], opaque[:])
	keys.ctr[12] &= 0x7f
	result, plaintext := sliceForAppend(dst, len(ciphertext))
	cipher.NewCTR(keys.encryption, keys.ctr[:]).XORKeyStream(plaintext, ciphertext)
	tag := keys.gmac(keys.synthetic[:8], additionalData, plaintext)
	folded := foldGMACTag(tag)
	if subtle.ConstantTimeCompare(folded[:], keys.synthetic[gmacSIVIVSize:]) != 1 {
		clearBytes(plaintext)
		return nil, ErrInvalidGMACSIV
	}
	return result, nil
}

// sliceForAppend extends dst by size bytes and returns the full slice and the
// appended region without initializing reusable capacity.
func sliceForAppend(dst []byte, size int) (result, appended []byte) {
	if total := len(dst) + size; total >= len(dst) && total <= cap(dst) {
		result = dst[:total]
	} else {
		result = make([]byte, len(dst)+size)
		copy(result, dst)
	}
	return result, result[len(dst):]
}

// clearBytes overwrites data without requiring the Go 1.21 clear built-in.
func clearBytes(data []byte) {
	for index := range data {
		data[index] = 0
	}
}

// deriveGMACSIVKeys derives the independent AES authentication and encryption
// keys from a ZeroTier shared secret.
func deriveGMACSIVKeys(key []byte) ([32]byte, [32]byte, error) {
	var k0, k1 [gmacSIVAESKeySize]byte
	if len(key) < gmacSIVMasterKeySize {
		return k0, k1, ErrInvalidGMACSIV
	}
	derive := func(label byte) [gmacSIVMasterKeySize]byte {
		// This is ZeroTier's SP 800-108-style counter-mode KBKDF input:
		// [iteration=0]_32 || "ZT" || label || 0 || context=0 || [L=384]_32.
		var message [13]byte
		binary.BigEndian.PutUint32(message[:4], 0)
		message[4], message[5], message[6] = 'Z', 'T', label
		binary.BigEndian.PutUint32(message[9:], 384)
		mac := hmac.New(sha512.New384, key[:gmacSIVMasterKeySize])
		_, _ = mac.Write(message[:])
		var output [gmacSIVMasterKeySize]byte
		copy(output[:], mac.Sum(nil))
		return output
	}
	derived0, derived1 := derive('0'), derive('1')
	// The KBKDF produces 384 bits for protocol compatibility; AES-256 uses
	// the first 256 bits. K0 is authentication-only and K1 is used for both
	// synthetic-IV encryption and payload CTR encryption.
	copy(k0[:], derived0[:gmacSIVAESKeySize])
	copy(k1[:], derived1[:gmacSIVAESKeySize])
	return k0, k1, nil
}

// foldGMACTag XOR-folds the 128-bit GMAC tag to its 64-bit wire form.
func foldGMACTag(tag [gmacSIVOpaqueSize]byte) [gmacSIVFoldedTagSize]byte {
	var folded [gmacSIVFoldedTagSize]byte
	for i := range folded {
		folded[i] = tag[i] ^ tag[gmacSIVFoldedTagSize+i]
	}
	return folded
}

// gmac computes ZeroTier's padded-AAD GMAC over aad and plaintext. The reused
// scratch buffer mirrors the native streaming implementation without exposing
// unauthenticated plaintext or allocating a packet-sized buffer per call.
func (keys *GMACSIVKeys) gmac(iv, aad, plaintext []byte) [gmacSIVOpaqueSize]byte {
	// ZeroTier initializes GMAC with the 64-bit packet IV followed by four
	// zero bytes. For a 96-bit GCM nonce, the standard library derives the
	// same J0 value (nonce || 0x00000001) as ZeroTier's GMAC implementation.
	copy(keys.nonce[:gmacSIVIVSize], iv)

	// ZeroTier streams padded AAD and plaintext into one GMAC calculation.
	// Padding AAD to a block boundary makes the AAD/plaintext split unique.
	// Supplying that combined byte string as GCM additional data, with empty
	// GCM plaintext, asks crypto/cipher to compute GMAC without encrypting it.
	paddedAADLength := (len(aad) + 15) &^ 15
	inputLength := paddedAADLength + len(plaintext)
	if cap(keys.scratch) < inputLength {
		keys.scratch = make([]byte, inputLength)
	}
	input := keys.scratch[:inputLength]
	copy(input, aad)
	for index := len(aad); index < paddedAADLength; index++ {
		input[index] = 0
	}
	copy(input[paddedAADLength:], plaintext)
	keys.authentication.Seal(keys.tag[:0], keys.nonce[:], nil, input)
	return keys.tag
}
