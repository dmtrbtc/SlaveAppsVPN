package yamux

import pool "github.com/metacubex/sing/common/buf"

func poolGet(size int) []byte {
	if size > 65536 { // wtf???
		return make([]byte, size)
	}
	return pool.Get(size)
}

func poolPut(buf []byte) {
	if len(buf) > 65536 { // wtf???
		return
	}
	pool.Put(buf)
}
