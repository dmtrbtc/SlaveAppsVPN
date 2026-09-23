// Package ztcrypto contains protocol-specific cryptographic primitives.
//
// The Salsa20 core is based on the public-domain Salsa20 specification and
// the BSD-licensed Go implementation in golang.org/x/crypto. ZeroTier uses
// the reduced-round Salsa20/12 variant for packet protection.
package ztcrypto

import (
	"encoding/binary"
	"math/bits"
)

// sigma is the standard 32-byte-key Salsa20 expansion constant.
var sigma = [16]byte{'e', 'x', 'p', 'a', 'n', 'd', ' ', '3', '2', '-', 'b', 'y', 't', 'e', ' ', 'k'}

// Salsa2012XORKeyStream XORs src with the ZeroTier Salsa20/12 stream. The
// nonce is 8 bytes and the stream counter starts at zero.
func Salsa2012XORKeyStream(dst, src []byte, nonce *[8]byte, key *[32]byte) {
	if len(dst) < len(src) {
		panic("ztcrypto: output smaller than input")
	}
	var input [16]byte
	copy(input[:8], nonce[:])
	for len(src) > 0 {
		var block [64]byte
		salsaCore(&block, &input, key, 12)
		n := len(src)
		if n > len(block) {
			n = len(block)
		}
		for i := 0; i < n; i++ {
			dst[i] = src[i] ^ block[i]
		}
		counter := binary.LittleEndian.Uint64(input[8:]) + 1
		binary.LittleEndian.PutUint64(input[8:], counter)
		dst = dst[n:]
		src = src[n:]
	}
}

// salsaCore computes one Salsa20 block with the requested even round count.
func salsaCore(out *[64]byte, in *[16]byte, key *[32]byte, rounds int) {
	j0 := binary.LittleEndian.Uint32(sigma[0:4])
	j1 := binary.LittleEndian.Uint32(key[0:4])
	j2 := binary.LittleEndian.Uint32(key[4:8])
	j3 := binary.LittleEndian.Uint32(key[8:12])
	j4 := binary.LittleEndian.Uint32(key[12:16])
	j5 := binary.LittleEndian.Uint32(sigma[4:8])
	j6 := binary.LittleEndian.Uint32(in[0:4])
	j7 := binary.LittleEndian.Uint32(in[4:8])
	j8 := binary.LittleEndian.Uint32(in[8:12])
	j9 := binary.LittleEndian.Uint32(in[12:16])
	j10 := binary.LittleEndian.Uint32(sigma[8:12])
	j11 := binary.LittleEndian.Uint32(key[16:20])
	j12 := binary.LittleEndian.Uint32(key[20:24])
	j13 := binary.LittleEndian.Uint32(key[24:28])
	j14 := binary.LittleEndian.Uint32(key[28:32])
	j15 := binary.LittleEndian.Uint32(sigma[12:16])

	x0, x1, x2, x3 := j0, j1, j2, j3
	x4, x5, x6, x7 := j4, j5, j6, j7
	x8, x9, x10, x11 := j8, j9, j10, j11
	x12, x13, x14, x15 := j12, j13, j14, j15

	for i := 0; i < rounds; i += 2 {
		x4 ^= bits.RotateLeft32(x0+x12, 7)
		x8 ^= bits.RotateLeft32(x4+x0, 9)
		x12 ^= bits.RotateLeft32(x8+x4, 13)
		x0 ^= bits.RotateLeft32(x12+x8, 18)
		x9 ^= bits.RotateLeft32(x5+x1, 7)
		x13 ^= bits.RotateLeft32(x9+x5, 9)
		x1 ^= bits.RotateLeft32(x13+x9, 13)
		x5 ^= bits.RotateLeft32(x1+x13, 18)
		x14 ^= bits.RotateLeft32(x10+x6, 7)
		x2 ^= bits.RotateLeft32(x14+x10, 9)
		x6 ^= bits.RotateLeft32(x2+x14, 13)
		x10 ^= bits.RotateLeft32(x6+x2, 18)
		x3 ^= bits.RotateLeft32(x15+x11, 7)
		x7 ^= bits.RotateLeft32(x3+x15, 9)
		x11 ^= bits.RotateLeft32(x7+x3, 13)
		x15 ^= bits.RotateLeft32(x11+x7, 18)

		x1 ^= bits.RotateLeft32(x0+x3, 7)
		x2 ^= bits.RotateLeft32(x1+x0, 9)
		x3 ^= bits.RotateLeft32(x2+x1, 13)
		x0 ^= bits.RotateLeft32(x3+x2, 18)
		x6 ^= bits.RotateLeft32(x5+x4, 7)
		x7 ^= bits.RotateLeft32(x6+x5, 9)
		x4 ^= bits.RotateLeft32(x7+x6, 13)
		x5 ^= bits.RotateLeft32(x4+x7, 18)
		x11 ^= bits.RotateLeft32(x10+x9, 7)
		x8 ^= bits.RotateLeft32(x11+x10, 9)
		x9 ^= bits.RotateLeft32(x8+x11, 13)
		x10 ^= bits.RotateLeft32(x9+x8, 18)
		x12 ^= bits.RotateLeft32(x15+x14, 7)
		x13 ^= bits.RotateLeft32(x12+x15, 9)
		x14 ^= bits.RotateLeft32(x13+x12, 13)
		x15 ^= bits.RotateLeft32(x14+x13, 18)
	}

	words := [16]uint32{x0 + j0, x1 + j1, x2 + j2, x3 + j3, x4 + j4, x5 + j5, x6 + j6, x7 + j7, x8 + j8, x9 + j9, x10 + j10, x11 + j11, x12 + j12, x13 + j13, x14 + j14, x15 + j15}
	for i, word := range words {
		binary.LittleEndian.PutUint32(out[i*4:], word)
	}
}
