package lz4block

import (
	"testing"
)

func TestBlockGetPut(t *testing.T) {
	expect := map[BlockSizeIndex]uint32{ // block index -> expected size
		4: Block64Kb,
		5: Block256Kb,
		6: Block1Mb,
		7: Block4Mb,
		3: Block8Mb,
	}
	for idx, size := range expect {
		buf := idx.Get()
		if uint32(cap(buf)) != size {
			t.Errorf("expected size %d for index %d, got %d", size, idx, cap(buf))
		}
		Put(buf) // ensure no panic
	}
}

func TestBlockGetInvalid(t *testing.T) {
	defer func() { recover() }() // swallow panic
	_ = BlockSizeIndex(123).Get()
	t.Fatalf("expected panic on bad Get")
}

func TestBlockPutInvalid(t *testing.T) {
	defer func() { recover() }() // swallow panic
	Put(make([]byte, 123))
	t.Fatalf("expected panic on bad Put")
}

func BenchmarkGetPut(b *testing.B) {
	const idx = BlockSizeIndex(4)
	for i := 0; i < b.N; i++ {
		buf := idx.Get()
		Put(buf)
	}
}
