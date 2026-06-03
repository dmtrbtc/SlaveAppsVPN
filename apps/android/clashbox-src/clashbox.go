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
	"context"
	"encoding/json"
	"fmt"
	"syscall"
	"time"

	"github.com/metacubex/mihomo/adapter/outboundgroup"
	"github.com/metacubex/mihomo/common/utils"
	"github.com/metacubex/mihomo/component/dialer"
	"github.com/metacubex/mihomo/constant"
	"github.com/metacubex/mihomo/hub/executor"
	"github.com/metacubex/mihomo/log"
	"github.com/metacubex/mihomo/tunnel"
	"github.com/metacubex/mihomo/tunnel/statistic"
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

// SelectProxy sets the active member of a `select` proxy group (e.g.
// "SLAVE-SELECT") to `name`. This is exactly what the clash external-controller
// PUT /proxies/{group} does — but our embedding uses executor.ApplyConfig, which
// does NOT start that HTTP controller, so we expose the same operation directly.
// New connections then egress through the chosen server.
func SelectProxy(group, name string) error {
	p, ok := tunnel.Proxies()[group]
	if !ok {
		return fmt.Errorf("proxy group %q not found", group)
	}
	selector, ok := p.Adapter().(outboundgroup.SelectAble)
	if !ok {
		return fmt.Errorf("proxy %q is not a selectable group", group)
	}
	before := CurrentProxy(group)
	if err := selector.Set(name); err != nil {
		// Warnln so it always reaches the in-app Logs (Диагностика→Логи).
		log.Warnln("[slave-select] %s set %q FAILED: %v", group, name, err)
		return err
	}
	// mihomo does NOT re-route already-established connections on a selector
	// change, so drop them — new connections then egress through the chosen
	// node (otherwise keep-alive reuse masks the switch and the IP looks stuck).
	closeAllConnections()
	log.Warnln("[slave-select] %s: %q -> %q (now leaf=%q)", group, before, name, CurrentProxy(group))
	return nil
}

// closeAllConnections drops every tracked connection (same as the clash API
// DELETE /connections) so a proxy switch takes effect immediately.
func closeAllConnections() {
	statistic.DefaultManager.Range(func(c statistic.Tracker) bool {
		_ = c.Close()
		return true
	})
}

// ─── Telemetry (dashboard) ──────────────────────────────────────────────────

// GetTraffic returns live up/down speed (bytes/s) and cumulative totals as JSON:
// {"up":N,"down":N,"upTotal":N,"downTotal":N}.
func GetTraffic() string {
	up, down := statistic.DefaultManager.Now()
	upTotal, downTotal := statistic.DefaultManager.Total()
	b, err := json.Marshal(map[string]int64{
		"up": up, "down": down, "upTotal": upTotal, "downTotal": downTotal,
	})
	if err != nil {
		return "{}"
	}
	return string(b)
}

// GetConnections returns the clash-API connections snapshot as JSON.
func GetConnections() string {
	b, err := json.Marshal(statistic.DefaultManager.Snapshot())
	if err != nil {
		return "{}"
	}
	return string(b)
}

// TestDelay measures the latency (ms) of a single proxy via an URL test (same
// as the clash API GET /proxies/{name}/delay). Returns -1 on error/timeout.
func TestDelay(name, url string, timeoutMs int) int {
	p, ok := tunnel.Proxies()[name]
	if !ok {
		return -1
	}
	if url == "" {
		url = "https://www.gstatic.com/generate_204"
	}
	if timeoutMs <= 0 {
		timeoutMs = 5000
	}
	expected, _ := utils.NewUnsignedRanges[uint16]("")
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutMs)*time.Millisecond)
	defer cancel()
	delay, err := p.URLTest(ctx, url, expected)
	if err != nil {
		return -1
	}
	return int(delay)
}

// CurrentProxy returns the effective active proxy name for a group, resolving
// nested groups (e.g. SLAVE-SELECT → SLAVE-AUTO → "Slave-EE") down to the leaf
// node actually carrying traffic. Returns "" if the group is unknown.
func CurrentProxy(group string) string {
	proxies := tunnel.Proxies()
	name := group
	for i := 0; i < 8; i++ {
		p, ok := proxies[name]
		if !ok {
			return name
		}
		g, ok := p.Adapter().(interface{ Now() string })
		if !ok {
			return name // a real proxy, not a group
		}
		now := g.Now()
		if now == "" || now == name {
			return name
		}
		name = now
	}
	return name
}
