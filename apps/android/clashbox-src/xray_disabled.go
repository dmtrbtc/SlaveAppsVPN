//go:build !xray

package clashbox

import "errors"

func prepareFinalMask(proxies []map[string]any, _ Protector) (bool, error) {
	for _, proxy := range proxies {
		if _, ok := proxy["slave-xray-finalmask"]; ok {
			return false, errors.New("This Android core does not include Xray FinalMask")
		}
	}
	return false, nil
}

func stopXray() error { return nil }
