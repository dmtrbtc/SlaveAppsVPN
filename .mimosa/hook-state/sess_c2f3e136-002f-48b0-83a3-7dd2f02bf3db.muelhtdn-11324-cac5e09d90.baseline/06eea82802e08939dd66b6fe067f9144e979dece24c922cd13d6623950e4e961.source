//go:build windows && go1.23 && !go1.25

package tfo

import (
	"errors"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

// operation contains superset of data necessary to perform all async IO.
//
// Copied from src/internal/poll/fd_windows.go
type operation struct {
	// Used by IOCP interface, it must be first field
	// of the struct, as our code rely on it.
	o syscall.Overlapped

	// fields used by runtime.netpoll
	runtimeCtx uintptr
	mode       int32

	// fields used only by net package
	fd     *pFD
	buf    syscall.WSABuf
	msg    windows.WSAMsg
	sa     syscall.Sockaddr
	rsa    *syscall.RawSockaddrAny
	rsan   int32
	handle syscall.Handle
	flags  uint32
	qty    uint32
	bufs   []syscall.WSABuf
}

// execIO executes a single IO operation o. It submits and cancels
// IO in the current thread for systems where Windows CancelIoEx API
// is available. Alternatively, it passes the request onto
// runtime netpoll and waits for completion or cancels request.
func execIO(o *operation, submit func(o *operation) error) (int, error) {
	if o.fd.pd.runtimeCtx == 0 {
		return 0, errors.New("internal error: polling on unsupported descriptor type")
	}

	fd := o.fd
	// Notify runtime netpoll about starting IO.
	err := fd.pd.prepare(int(o.mode), fd.isFile)
	if err != nil {
		return 0, err
	}
	// Start IO.
	err = submit(o)
	switch err {
	case nil:
		// IO completed immediately
		if o.fd.skipSyncNotif {
			// No completion message will follow, so return immediately.
			return int(o.qty), nil
		}
		// Need to get our completion message anyway.
	case syscall.ERROR_IO_PENDING:
		// IO started, and we have to wait for its completion.
		err = nil
	default:
		return 0, err
	}
	// Wait for our request to complete.
	err = fd.pd.wait(int(o.mode), fd.isFile)
	if err == nil {
		err = windows.WSAGetOverlappedResult(windows.Handle(fd.Sysfd), (*windows.Overlapped)(unsafe.Pointer(&o.o)), &o.qty, false, &o.flags)
		// All is good. Extract our IO results and return.
		if err != nil {
			// More data available. Return back the size of received data.
			if err == syscall.ERROR_MORE_DATA || err == windows.WSAEMSGSIZE {
				return int(o.qty), err
			}
			return 0, err
		}
		return int(o.qty), nil
	}
	// IO is interrupted by "close" or "timeout"
	netpollErr := err
	switch netpollErr {
	case ErrNetClosing, ErrFileClosing, ErrDeadlineExceeded:
		// will deal with those.
	default:
		panic("unexpected runtime.netpoll error: " + netpollErr.Error())
	}
	// Cancel our request.
	err = syscall.CancelIoEx(fd.Sysfd, &o.o)
	// Assuming ERROR_NOT_FOUND is returned, if IO is completed.
	if err != nil && err != syscall.ERROR_NOT_FOUND {
		// TODO(brainman): maybe do something else, but panic.
		panic(err)
	}
	// Wait for cancellation to complete.
	fd.pd.waitCanceled(int(o.mode))
	err = windows.WSAGetOverlappedResult(windows.Handle(fd.Sysfd), (*windows.Overlapped)(unsafe.Pointer(&o.o)), &o.qty, false, &o.flags)
	if err != nil {
		if err == syscall.ERROR_OPERATION_ABORTED { // IO Canceled
			err = netpollErr
		}
		return 0, err
	}
	// We issued a cancellation request. But, it seems, IO operation succeeded
	// before the cancellation request run. We need to treat the IO operation as
	// succeeded (the bytes are actually sent/recv from network).
	return int(o.qty), nil
}

// fileKind describes the kind of file.
// Stay in sync with FD in src/internal/poll/fd_windows.go
type fileKind byte

const (
	kindNet fileKind = iota
	kindFile
	kindConsole
	kindPipe
)

// This package uses the SetFileCompletionNotificationModes Windows
// API to skip calling GetQueuedCompletionStatus if an IO operation
// completes synchronously. There is a known bug where
// SetFileCompletionNotificationModes crashes on some systems (see
// https://support.microsoft.com/kb/2568167 for details).

var useSetFileCompletionNotificationModes bool // determines is SetFileCompletionNotificationModes is present and safe to use

// checkSetFileCompletionNotificationModes verifies that
// SetFileCompletionNotificationModes Windows API is present
// on the system and is safe to use.
// See https://support.microsoft.com/kb/2568167 for details.
func checkSetFileCompletionNotificationModes() {
	err := syscall.LoadSetFileCompletionNotificationModes()
	if err != nil {
		return
	}
	protos := [2]int32{syscall.IPPROTO_TCP, 0}
	var buf [32]syscall.WSAProtocolInfo
	len := uint32(unsafe.Sizeof(buf))
	n, err := syscall.WSAEnumProtocols(&protos[0], &buf[0], &len)
	if err != nil {
		return
	}
	for i := int32(0); i < n; i++ {
		if buf[i].ServiceFlags1&syscall.XP1_IFS_HANDLES == 0 {
			return
		}
	}
	useSetFileCompletionNotificationModes = true
}

func init() {
	checkSetFileCompletionNotificationModes()
}

func (fd *pFD) Init(net string, pollable bool) (string, error) {
	switch net {
	case "file", "dir":
		fd.kind = kindFile
	case "console":
		fd.kind = kindConsole
	case "pipe":
		fd.kind = kindPipe
	case "tcp", "tcp4", "tcp6",
		"udp", "udp4", "udp6",
		"ip", "ip4", "ip6",
		"unix", "unixgram", "unixpacket":
		fd.kind = kindNet
	default:
		return "", errors.New("internal error: unknown network type " + net)
	}
	fd.isFile = fd.kind != kindNet

	var err error
	if pollable {
		// Only call init for a network socket.
		// This means that we don't add files to the runtime poller.
		// Adding files to the runtime poller can confuse matters
		// if the user is doing their own overlapped I/O.
		// See issue #21172.
		//
		// In general the code below avoids calling the execIO
		// function for non-network sockets. If some method does
		// somehow call execIO, then execIO, and therefore the
		// calling method, will return an error, because
		// fd.pd.runtimeCtx will be 0.
		err = fd.pd.init(fd)
	}
	if err != nil {
		return "", err
	}
	if pollable && useSetFileCompletionNotificationModes {
		// We do not use events, so we can skip them always.
		flags := uint8(syscall.FILE_SKIP_SET_EVENT_ON_HANDLE)
		switch net {
		case "tcp", "tcp4", "tcp6",
			"udp", "udp4", "udp6":
			flags |= syscall.FILE_SKIP_COMPLETION_PORT_ON_SUCCESS
		}
		err := syscall.SetFileCompletionNotificationModes(fd.Sysfd, flags)
		if err == nil && flags&syscall.FILE_SKIP_COMPLETION_PORT_ON_SUCCESS != 0 {
			fd.skipSyncNotif = true
		}
	}
	// Disable SIO_UDP_CONNRESET behavior.
	// http://support.microsoft.com/kb/263823
	switch net {
	case "udp", "udp4", "udp6":
		ret := uint32(0)
		flag := uint32(0)
		size := uint32(unsafe.Sizeof(flag))
		err := syscall.WSAIoctl(fd.Sysfd, syscall.SIO_UDP_CONNRESET, (*byte)(unsafe.Pointer(&flag)), size, nil, 0, &ret, nil, 0)
		if err != nil {
			return "wsaioctl", err
		}
	}
	fd.rop.mode = 'r'
	fd.wop.mode = 'w'
	fd.rop.fd = fd
	fd.wop.fd = fd
	fd.rop.runtimeCtx = fd.pd.runtimeCtx
	fd.wop.runtimeCtx = fd.pd.runtimeCtx
	return "", nil
}
