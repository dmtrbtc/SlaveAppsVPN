// Package clashbox is a thin gomobile-bindable wrapper around the mihomo
// (Clash.Meta) core, analogous to sing-box's experimental/libbox. It lets the
// SLAVE VPN Android client run mihomo — which DOES support VLESS Encryption
// (ML-KEM-768 / X25519), unlike the sing-box libbox we shipped before.
//
// Design mirrors ClashMetaForAndroid's embedding contract:
//   - the TUN file descriptor from Android VpnService is passed via the clash
//     config field `tun.file-descriptor` (mihomo opens the TUN from that fd);
//   - sockets the core dials to the proxy server are protected from the TUN via
//     dialer.DefaultSocketHook -> VpnService.protect(fd) (the Protector iface);
//   - config is the SAME Clash YAML our shared generateMihomoConfig emits on
//     Windows, so enc nodes are no longer skipped.
package clashbox

import (
	"syscall"

	"github.com/metacubex/mihomo/component/dialer"
	"github.com/metacubex/mihomo/constant"
	"github.com/metacubex/mihomo/hub/executor"
	"github.com/metacubex/mihomo/log"
)

// Protector is implemented in Kotlin. Protect MUST call
// VpnService.protect(fd) so the core's outbound sockets to the proxy server do
// not loop back through the TUN. Returning false is non-fatal (logged upstream).
type Protector interface {
	Protect(fd int) bool
}

// LogHandler is implemented in Kotlin to receive core log lines (level, message).
type LogHandler interface {
	Log(level string, message string)
}

// Setup initialises the core working directory. Call once before Start.
func Setup(homeDir string) {
	constant.SetHomeDir(homeDir)
}

// SetProtector wires the Android socket protector into the core dialer. Pass a
// non-nil Protector before Start; pass nil to clear.
func SetProtector(p Protector) {
	if p == nil {
		dialer.DefaultSocketHook = nil
		return
	}
	dialer.DefaultSocketHook = func(network, address string, conn syscall.RawConn) error {
		return conn.Control(func(fd uintptr) {
			p.Protect(int(fd))
		})
	}
}

var logStop chan struct{}

// StartLogForward subscribes to core logs and forwards them to the handler on a
// background goroutine. Safe to call once; StopLogForward ends it.
func StartLogForward(h LogHandler) {
	if h == nil {
		return
	}
	StopLogForward()
	sub := log.Subscribe()
	stop := make(chan struct{})
	logStop = stop
	go func() {
		defer log.UnSubscribe(sub)
		for {
			select {
			case <-stop:
				return
			case ev, ok := <-sub:
				if !ok {
					return
				}
				h.Log(ev.LogLevel.String(), ev.Payload)
			}
		}
	}()
}

// StopLogForward stops the log forwarding goroutine if running.
func StopLogForward() {
	if logStop != nil {
		close(logStop)
		logStop = nil
	}
}

// Start parses the given Clash config (YAML bytes as a string) and applies it.
// The config must carry tun.file-descriptor set to the VpnService TUN fd.
// Returns the parse error (if any) so the caller can show a SPECIFIC reason —
// e.g. an unusable VLESS encryption string fails here, not silently.
func Start(configContent string) error {
	cfg, err := executor.ParseWithBytes([]byte(configContent))
	if err != nil {
		return err
	}
	executor.ApplyConfig(cfg, true)
	return nil
}

// Stop shuts the core down (closes TUN, listeners, connections).
func Stop() {
	executor.Shutdown()
}

// Version returns the embedded mihomo core version string.
func Version() string {
	return constant.Version
}
