//go:build go1.21

package tfo

func init() {
	// Initialize [listenConfigCases].
	for i := range listenConfigCases {
		c := &listenConfigCases[i]
		switch c.mptcp {
		case mptcpUseDefault:
		case mptcpEnabled:
			c.listenConfig.SetMultipathTCP(true)
		case mptcpDisabled:
			c.listenConfig.SetMultipathTCP(false)
		default:
			panic("unreachable")
		}
	}

	// Initialize [dialerCases].
	for i := range dialerCases {
		c := &dialerCases[i]
		switch c.mptcp {
		case mptcpUseDefault:
		case mptcpEnabled:
			c.dialer.SetMultipathTCP(true)
		case mptcpDisabled:
			c.dialer.SetMultipathTCP(false)
		default:
			panic("unreachable")
		}
	}
}
