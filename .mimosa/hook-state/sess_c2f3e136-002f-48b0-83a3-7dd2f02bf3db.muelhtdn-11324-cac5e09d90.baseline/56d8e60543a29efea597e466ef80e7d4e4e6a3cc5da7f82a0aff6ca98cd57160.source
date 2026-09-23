package ppmd

import (
	"bytes"
	"fmt"
	"io"
	"os"
	"runtime/debug"
	"testing"
	"time"
)

func TestDecompress(t *testing.T) {
	/* default causes every loop after the first to garbage collect in runPpmd */
	debug.SetGCPercent(1000)
	runPpmd()
}

func runPpmd() {
	srcFile := "testdata/readme.raw"
	ppmdFile := "testdata/readme.ppmd"
	memory := 65536
	filesize := 167
	order := 7

	buf, err := os.ReadFile(ppmdFile)
	if err != nil {
		panic(err)
	}
	b2, err := os.ReadFile(srcFile)
	if err != nil {
		panic(err)
	}
	var decomp []byte
	for j := 0; j < 5; j++ {
		t := time.Now()
		d, err := NewH7zReader(bytes.NewReader(buf), order, memory, filesize)
		if err != nil {
			panic(err)
		}
		decomp, err = io.ReadAll(&d)
		if err != nil {
			panic(err)
		}
		fmt.Println("decompressed go", len(decomp), "in", time.Since(t))
	}

	for i := 0; i < len(b2) && i < len(decomp); i++ {
		if b2[i] != decomp[i] {
			panic(fmt.Sprintf("differs at %v", i))
		}
	}
	if len(b2) != len(decomp) {
		panic(fmt.Sprint("length mismatch ", len(b2), "!=", len(decomp)))
	}
	fmt.Println("match")
}
