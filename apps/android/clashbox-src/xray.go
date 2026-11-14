//go:build xray

package clashbox

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"

	"github.com/xtls/xray-core/core"
	_ "github.com/xtls/xray-core/main/distro/all"
	"github.com/xtls/xray-core/transport/internet"
)

const finalMaskOutbound = "slave-xray-finalmask"

// XrayResolver resolves the upstream on the physical Android network.
type XrayResolver interface {
	Resolve(host string) string
}

var xrayResolver XrayResolver

func SetXrayResolver(resolver XrayResolver) {
	xrayResolver = resolver
}

func resolveXrayUpstream(outbound, stream map[string]any) error {
	settings, _ := outbound["settings"].(map[string]any)
	if targets, ok := settings["vnext"].([]any); ok && len(targets) == 1 {
		settings, _ = targets[0].(map[string]any)
	}
	host, _ := settings["address"].(string)
	if host == "" {
		return errors.New("Missing FinalMask upstream")
	}
	if net.ParseIP(host) != nil {
		return nil
	}
	if xrayResolver == nil {
		return errors.New("FinalMask physical DNS unavailable")
	}
	address := xrayResolver.Resolve(host)
	if net.ParseIP(address) == nil {
		return errors.New("FinalMask upstream DNS failed")
	}
	if security, _ := stream["security"].(string); security == "tls" || security == "reality" {
		key := security + "Settings"
		options, _ := stream[key].(map[string]any)
		if options == nil {
			options = make(map[string]any)
			stream[key] = options
		}
		if options["serverName"] == nil || options["serverName"] == "" {
			options["serverName"] = host
		}
	}
	settings["address"] = address
	return nil
}

func prepareFinalMask(proxies []map[string]any, protector Protector) (bool, error) {
	var inbounds, outbounds, rules []map[string]any
	for _, proxy := range proxies {
		value, exists := proxy[finalMaskOutbound]
		if !exists {
			continue
		}
		outbound, ok := value.(map[string]any)
		if !ok {
			return false, errors.New("Invalid FinalMask outbound")
		}
		stream, _ := outbound["streamSettings"].(map[string]any)
		mask, _ := stream["finalmask"].(map[string]any)
		tcp, _ := mask["tcp"].([]any)
		sockopt, _ := stream["sockopt"].(map[string]any)
		network, security := stream["network"], stream["security"]
		if outbound["protocol"] != "vless" || len(tcp) == 0 ||
			(network != nil && network != "raw" && network != "tcp") ||
			(security != nil && security != "none" && security != "tls" && security != "reality") ||
			outbound["proxySettings"] != nil || sockopt["dialerProxy"] != nil {
			return false, errors.New("FinalMask requires a standalone VLESS/TCP outbound")
		}
		if err := resolveXrayUpstream(outbound, stream); err != nil {
			return false, err
		}
		listener, err := net.Listen("tcp4", "127.0.0.1:0")
		if err != nil {
			return false, errors.New("FinalMask loopback port unavailable")
		}
		port := listener.Addr().(*net.TCPAddr).Port
		_ = listener.Close()
		secret := make([]byte, 24)
		if _, err := rand.Read(secret); err != nil {
			return false, errors.New("FinalMask loopback credentials unavailable")
		}
		password := base64.RawURLEncoding.EncodeToString(secret)
		name := proxy["name"]
		inboundTag, outboundTag := "in-"+password, "out-"+password
		outbound["tag"] = outboundTag
		inbounds = append(inbounds, map[string]any{
			"tag": inboundTag, "listen": "127.0.0.1", "port": port, "protocol": "socks",
			"settings": map[string]any{"auth": "password", "accounts": []map[string]string{{"user": "slave", "pass": password}}},
		})
		outbounds = append(outbounds, outbound)
		rules = append(rules, map[string]any{"type": "field", "inboundTag": []string{inboundTag}, "outboundTag": outboundTag})
		clear(proxy)
		proxy["name"], proxy["type"], proxy["server"], proxy["port"] = name, "socks5", "127.0.0.1", port
		proxy["username"], proxy["password"], proxy["udp"] = "slave", password, false
	}
	if len(inbounds) == 0 {
		return false, nil
	}
	outbounds = append([]map[string]any{{"tag": "reject", "protocol": "blackhole"}}, outbounds...)
	config, err := json.Marshal(map[string]any{"log": map[string]any{"loglevel": "none"}, "inbounds": inbounds,
		"outbounds": outbounds, "routing": map[string]any{"rules": rules}})
	if err != nil {
		return false, errors.New("Invalid FinalMask bridge configuration")
	}
	if err := startXray(string(config), protector); err != nil {
		return false, err
	}
	return true, nil
}

type protectedXrayDialer struct {
	protector Protector
}

var xrayDialer atomic.Pointer[protectedXrayDialer]
var xrayControllerOnce sync.Once
var xrayControllerError error
var xrayMu sync.Mutex
var xrayCore *core.Instance

// startXray starts a local FinalMask bridge in the VPN service's process.
func startXray(config string, protector Protector) error {
	xrayMu.Lock()
	defer xrayMu.Unlock()
	if xrayCore != nil || protector == nil {
		return errors.New("Xray cannot start without a VPN socket protector or while running")
	}
	xrayControllerOnce.Do(func() {
		xrayControllerError = internet.RegisterDialerController(protectXraySocket)
	})
	if xrayControllerError != nil {
		return errors.New("Xray socket protector registration failed")
	}
	parsed, err := core.LoadConfig("json", strings.NewReader(config))
	if err != nil {
		return errors.New("Invalid Xray FinalMask configuration")
	}
	instance, err := core.New(parsed)
	if err != nil {
		return errors.New("Xray FinalMask initialization failed")
	}
	xrayDialer.Store(&protectedXrayDialer{protector})
	if err := instance.Start(); err != nil {
		_ = instance.Close()
		xrayDialer.Store(nil)
		return errors.New("Xray FinalMask startup failed")
	}
	xrayCore = instance
	return nil
}

func protectXraySocket(_, _ string, conn syscall.RawConn) error {
	dialer := xrayDialer.Load()
	if dialer == nil {
		return errors.New("Xray VPN socket protector unavailable")
	}
	protected := false
	if err := conn.Control(func(fd uintptr) {
		protected = dialer.protector.Protect(int(fd))
	}); err != nil {
		return err
	}
	if !protected {
		return errors.New("Xray socket protection failed")
	}
	return nil
}

// stopXray releases the local bridge before the next VPN connection.
func stopXray() error {
	xrayMu.Lock()
	defer xrayMu.Unlock()
	if xrayCore == nil {
		return nil
	}
	err := xrayCore.Close()
	xrayCore = nil
	xrayDialer.Store(nil)
	if err != nil {
		return errors.New("Xray FinalMask shutdown failed")
	}
	return nil
}
