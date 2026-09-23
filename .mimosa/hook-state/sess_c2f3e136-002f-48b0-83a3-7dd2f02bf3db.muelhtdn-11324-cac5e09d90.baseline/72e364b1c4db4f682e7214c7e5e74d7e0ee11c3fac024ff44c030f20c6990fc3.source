//go:build windows && go1.27

package tfo

import (
	"runtime"
	"sync"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

// operation contains superset of data necessary to perform all async IO.
//
// Copied from src/internal/poll/fd_windows.go
type operation struct {
	// Used by IOCP interface, it must be first field
	// of the struct, as our code relies on it.
	o syscall.Overlapped

	// fields used by runtime.netpoll
	runtimeCtx uintptr
	mode       int32
}

func (o *operation) setOffset(off int64) {
	o.o.OffsetHigh = uint32(off >> 32)
	o.o.Offset = uint32(off)
}

var operationPool = sync.Pool{
	New: func() any {
		return new(operation)
	},
}

// waitIO waits for the IO operation to complete,
// handling cancellation if necessary.
func (fd *pFD) waitIO(o *operation) error {
	if o.o.HEvent != 0 {
		// The overlapped handle is not added to the runtime poller,
		// the only way to wait for the IO to complete is block until
		// the overlapped event is signaled.
		_, err := syscall.WaitForSingleObject(o.o.HEvent, syscall.INFINITE)
		return err
	}
	// Wait for our request to complete.
	err := fd.pd.wait(int(o.mode), fd.isFile)
	switch err {
	case nil:
		// IO completed successfully.
	case ErrNetClosing, ErrFileClosing, ErrDeadlineExceeded:
		// IO interrupted by "close" or "timeout", cancel our request.
		// ERROR_NOT_FOUND can be returned when the request succeded
		// between the time wait returned and CancelIoEx was executed.
		if err := syscall.CancelIoEx(fd.Sysfd, &o.o); err != nil && err != syscall.ERROR_NOT_FOUND {
			// TODO(brainman): maybe do something else, but panic.
			panic(err)
		}
		fd.pd.waitCanceled(int(o.mode))
	default:
		// No other error is expected.
		panic("unexpected runtime.netpoll error: " + err.Error())
	}
	return err
}

// execIO executes a single IO operation o.
// It supports both synchronous and asynchronous IO.
// pinPtrs is a list of pointers that will be pinned to a fixed location in memory
// during the lifetime of the operation.
func (fd *pFD) execIO(
	mode int,
	submit func(o *operation) (uint32, error),
	pinPtrs ...any,
) (int, error) {
	// Notify runtime netpoll about starting IO.
	err := fd.pd.prepare(mode, fd.isFile)
	if err != nil {
		return 0, err
	}
	o := operationPool.Get().(*operation)
	defer operationPool.Put(o)
	*o = operation{
		runtimeCtx: fd.pd.runtimeCtx,
		mode:       int32(mode),
	}
	o.setOffset(fd.offset)
	if !fd.isBlocking {
		var pinner *runtime.Pinner
		if mode == 'r' {
			pinner = &fd.readPinner
		} else {
			pinner = &fd.writePinner
		}
		defer pinner.Unpin()

		pinner.Pin(o)
		for _, ptr := range pinPtrs {
			pinner.Pin(ptr)
		}

		if !fd.associated {
			// If the handle is opened for overlapped IO but we can't
			// use the runtime poller, then we need to use an
			// event to wait for the IO to complete.
			h, err := windows.CreateEvent(nil, 0, 0, nil)
			if err != nil {
				// This shouldn't happen when all CreateEvent arguments are zero.
				panic(err)
			}
			// Set the low bit so that the external IOCP doesn't receive the completion packet.
			o.o.HEvent = syscall.Handle(h | 1)
			defer syscall.CloseHandle(syscall.Handle(h))
		}
	}
	// Start IO.
	qty, err := submit(o)
	var waitErr error
	// Blocking operations shouldn't return ERROR_IO_PENDING.
	// Continue without waiting if that happens.
	if !fd.isBlocking && (err == syscall.ERROR_IO_PENDING || (err == nil && fd.waitOnSuccess)) {
		// IO started asynchronously or completed synchronously but
		// a sync notification is required. Wait for it to complete.
		waitErr = fd.waitIO(o)
		if fd.isFile {
			err = windows.GetOverlappedResult(windows.Handle(fd.Sysfd), (*windows.Overlapped)(unsafe.Pointer(&o.o)), &qty, false)
		} else {
			var flags uint32
			err = windows.WSAGetOverlappedResult(windows.Handle(fd.Sysfd), (*windows.Overlapped)(unsafe.Pointer(&o.o)), &qty, false, &flags)
		}
	}
	switch err {
	case syscall.ERROR_OPERATION_ABORTED:
		// ERROR_OPERATION_ABORTED may have been caused by us. In that case,
		// map it to our own error. Don't do more than that, each submitted
		// function may have its own meaning for each error.
		if waitErr != nil {
			// IO canceled by the poller while waiting for completion.
			err = waitErr
		} else if fd.kind == kindPipe && fd.closing() {
			// Close uses CancelIoEx to interrupt concurrent I/O for pipes.
			// If the fd is a pipe and the Write was interrupted by CancelIoEx,
			// we assume it is interrupted by Close.
			err = errClosing(fd.isFile)
		}
	case windows.ERROR_IO_INCOMPLETE:
		// waitIO couldn't wait for the IO to complete.
		if waitErr != nil {
			// The wait error will be more informative.
			err = waitErr
		}
	}
	return int(qty), err
}

// fileKind describes the kind of file.
type fileKind byte

const (
	kindNet fileKind = iota
	kindFile
	kindConsole
	kindPipe
)

// ifsHandlesOnly returns true if the system only has IFS handles for TCP sockets.
// See https://support.microsoft.com/kb/2568167 for details.
var ifsHandlesOnly = sync.OnceValue(func() bool {
	protos := [2]int32{syscall.IPPROTO_TCP, 0}
	var buf [32]syscall.WSAProtocolInfo
	len := uint32(unsafe.Sizeof(buf))
	n, err := syscall.WSAEnumProtocols(&protos[0], &buf[0], &len)
	if err != nil {
		return false
	}
	for i := int32(0); i < n; i++ {
		if buf[i].ServiceFlags1&syscall.XP1_IFS_HANDLES == 0 {
			return false
		}
	}
	return true
})

// canSkipCompletionPortOnSuccess returns true if we use FILE_SKIP_COMPLETION_PORT_ON_SUCCESS for the given handle.
// See https://support.microsoft.com/kb/2568167 for details.
func canSkipCompletionPortOnSuccess(h syscall.Handle, isSocket bool) bool {
	if !isSocket {
		// Non-socket handles can use SetFileCompletionNotificationModes without problems.
		return true
	}
	if ifsHandlesOnly() {
		// If the system only has IFS handles for TCP sockets, then there is nothing else to check.
		return true
	}
	var info syscall.WSAProtocolInfo
	size := int32(unsafe.Sizeof(info))
	const SO_PROTOCOL_INFOW = 0x2005
	if syscall.Getsockopt(h, syscall.SOL_SOCKET, SO_PROTOCOL_INFOW, (*byte)(unsafe.Pointer(&info)), &size) != nil {
		return false
	}
	return info.ServiceFlags1&syscall.XP1_IFS_HANDLES != 0
}

func (fd *pFD) Init(net string, pollable bool) error {
	switch net {
	case "file":
		fd.kind = kindFile
	case "console":
		fd.kind = kindConsole
	case "pipe":
		fd.kind = kindPipe
	default:
		// We don't actually care about the various network types.
		fd.kind = kindNet
	}
	fd.isFile = fd.kind != kindNet
	fd.isBlocking = !pollable

	if !pollable {
		return nil
	}

	// The default behavior of the Windows I/O manager is to queue a completion
	// port entry for successful operations that complete synchronously when
	// the handle is opened for overlapped I/O. We will try to disable that
	// behavior below, as it requires an extra syscall.
	fd.waitOnSuccess = true

	// It is safe to add overlapped handles that also perform I/O
	// outside of the runtime poller. The runtime poller will ignore
	// I/O completion notifications not initiated by us.
	err := fd.pd.init(fd)
	if err != nil {
		return err
	}
	fd.associated = true

	// FILE_SKIP_SET_EVENT_ON_HANDLE is always safe to use. We don't use that feature
	// and it adds some overhead to the Windows I/O manager.
	// See https://devblogs.microsoft.com/oldnewthing/20200221-00/?p=103466.
	modes := uint8(syscall.FILE_SKIP_SET_EVENT_ON_HANDLE)
	if canSkipCompletionPortOnSuccess(fd.Sysfd, fd.kind == kindNet) {
		modes |= syscall.FILE_SKIP_COMPLETION_PORT_ON_SUCCESS
	}
	if syscall.SetFileCompletionNotificationModes(fd.Sysfd, modes) == nil {
		if modes&syscall.FILE_SKIP_COMPLETION_PORT_ON_SUCCESS != 0 {
			fd.waitOnSuccess = false
		}
	}
	return nil
}
