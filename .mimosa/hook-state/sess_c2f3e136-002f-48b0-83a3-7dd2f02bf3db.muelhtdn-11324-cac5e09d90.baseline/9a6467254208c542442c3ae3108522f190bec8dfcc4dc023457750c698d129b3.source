// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

package zerotier

import (
	"errors"
	"net/url"
)

var (
	// ErrAuthenticationURLUnavailable reports a configuration without a usable
	// external-authentication URL.
	ErrAuthenticationURLUnavailable = errors.New("ZeroTier authentication URL is unavailable")
	// ErrInvalidAuthenticationURL reports a malformed or non-HTTP authentication
	// URL.
	ErrInvalidAuthenticationURL = errors.New("invalid ZeroTier authentication URL")
	// ErrOIDCUnsupported reports an enterprise SSO v1 configuration excluded by
	// this library.
	ErrOIDCUnsupported = errors.New("ZeroTier SSO v1 OIDC authentication is unsupported")
)

// LoginURL returns a controller-provided URL that can be opened directly by
// the user. SSO v1 exposes OIDC inputs rather than a login URL and requires a
// client to perform discovery, PKCE, callback handling, and token exchange.
func (info NetworkAuthenticationInfo) LoginURL() (string, error) {
	if info.Version == 1 {
		return "", ErrOIDCUnsupported
	}
	if info.AuthenticationURL == "" {
		return "", ErrAuthenticationURLUnavailable
	}
	parsed, err := url.Parse(info.AuthenticationURL)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return "", ErrInvalidAuthenticationURL
	}
	return info.AuthenticationURL, nil
}
