package yamux

import (
	"net"
)

// Addr is used to get the address of the listener.
func (s *Session) Addr() net.Addr {
	return s.LocalAddr()
}

// LocalAddr is used to get the local address of the
// underlying connection.
func (s *Session) LocalAddr() net.Addr {
	return s.conn.LocalAddr()
}

// RemoteAddr is used to get the address of remote end
// of the underlying connection
func (s *Session) RemoteAddr() net.Addr {
	return s.conn.RemoteAddr()
}

// LocalAddr returns the local address
func (s *Stream) LocalAddr() net.Addr {
	return s.session.LocalAddr()
}

// RemoteAddr returns the remote address
func (s *Stream) RemoteAddr() net.Addr {
	return s.session.RemoteAddr()
}
