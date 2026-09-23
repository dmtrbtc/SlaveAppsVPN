// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

package zerotier

import (
	"bytes"
	"errors"
	"fmt"
	"strconv"
	"strings"
)

// ErrInvalidDictionary reports malformed ZeroTier dictionary encoding.
var ErrInvalidDictionary = errors.New("invalid ZeroTier dictionary")

type Dictionary map[string][]byte

// ParseDictionary decodes ZeroTier's escaped newline-delimited key-value form.
func ParseDictionary(data []byte) (Dictionary, error) {
	if nul := bytes.IndexByte(data, 0); nul >= 0 {
		data = data[:nul]
	}
	dictionary := make(Dictionary)
	for _, line := range bytes.FieldsFunc(data, func(r rune) bool { return r == '\r' || r == '\n' }) {
		if len(line) == 0 {
			continue
		}
		equals := bytes.IndexByte(line, '=')
		if equals <= 0 {
			return nil, ErrInvalidDictionary
		}
		key := string(line[:equals])
		if _, exists := dictionary[key]; exists {
			continue
		}
		value, err := unescapeDictionaryValue(line[equals+1:])
		if err != nil {
			return nil, err
		}
		dictionary[key] = value
	}
	return dictionary, nil
}

// unescapeDictionaryValue decodes ZeroTier dictionary escape sequences.
func unescapeDictionaryValue(value []byte) ([]byte, error) {
	result := make([]byte, 0, len(value))
	for i := 0; i < len(value); i++ {
		if value[i] != '\\' {
			result = append(result, value[i])
			continue
		}
		i++
		if i >= len(value) {
			return nil, ErrInvalidDictionary
		}
		switch value[i] {
		case '0':
			result = append(result, 0)
		case 'r':
			result = append(result, '\r')
		case 'n':
			result = append(result, '\n')
		case 'e':
			result = append(result, '=')
		case '\\':
			result = append(result, '\\')
		default:
			result = append(result, value[i])
		}
	}
	return result, nil
}

// appendDictionaryEntry appends one escaped key-value entry to dst.
func appendDictionaryEntry(dst []byte, key string, value []byte) ([]byte, error) {
	if key == "" || strings.ContainsAny(key, "=\r\n\x00") {
		return nil, ErrInvalidDictionary
	}
	if len(dst) > 0 {
		dst = append(dst, '\n')
	}
	dst = append(dst, key...)
	dst = append(dst, '=')
	for _, b := range value {
		switch b {
		case 0:
			dst = append(dst, '\\', '0')
		case '\r':
			dst = append(dst, '\\', 'r')
		case '\n':
			dst = append(dst, '\\', 'n')
		case '\\':
			dst = append(dst, '\\', '\\')
		case '=':
			dst = append(dst, '\\', 'e')
		default:
			dst = append(dst, b)
		}
	}
	return dst, nil
}

// appendDictionaryUint appends value as a fixed-width hexadecimal entry.
func appendDictionaryUint(dst []byte, key string, value uint64) ([]byte, error) {
	return appendDictionaryEntry(dst, key, []byte(fmt.Sprintf("%016x", value)))
}

// Uint returns a hexadecimal integer entry or fallback when absent or invalid.
func (d Dictionary) Uint(key string, fallback uint64) uint64 {
	value, ok := d[key]
	if !ok || len(value) == 0 {
		return fallback
	}
	parsed, err := strconv.ParseUint(string(value), 16, 64)
	if err != nil {
		return fallback
	}
	return parsed
}

// Bool returns a Boolean entry or fallback when absent.
func (d Dictionary) Bool(key string, fallback bool) bool {
	value, ok := d[key]
	if !ok || len(value) == 0 {
		return fallback
	}
	return value[0] == '1' || value[0] == 't' || value[0] == 'T'
}

// String returns an entry as a string or the empty string when absent.
func (d Dictionary) String(key string) string {
	return string(d[key])
}
