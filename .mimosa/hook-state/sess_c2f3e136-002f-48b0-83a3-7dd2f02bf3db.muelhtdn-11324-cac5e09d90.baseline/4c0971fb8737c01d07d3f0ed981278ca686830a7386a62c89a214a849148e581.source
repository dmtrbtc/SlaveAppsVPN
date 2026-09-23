//go:build !linux

package device

import (
	"github.com/metacubex/wireguard-go/conn"
	"github.com/metacubex/wireguard-go/rwcancel"
)

func (device *Device) startRouteListener(_ conn.Bind) (*rwcancel.RWCancel, error) {
	return nil, nil
}
