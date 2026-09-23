// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

package zerotier

import (
	"crypto/rand"
	"encoding/binary"
	"net/netip"
)

const (
	// maxNetworkRules bounds rules accepted from one network configuration.
	maxNetworkRules = 1024
	// ruleActionDrop rejects the frame when the current rule set matches.
	ruleActionDrop = 0
	// ruleActionAccept permits the frame when the current rule set matches.
	ruleActionAccept = 1
	// ruleActionTee copies the frame to another network member.
	ruleActionTee = 2
	// ruleActionWatch copies the frame without changing its destination.
	ruleActionWatch = 3
	// ruleActionRedirect replaces the frame's ZeroTier destination.
	ruleActionRedirect = 4
	// ruleActionBreak ends the current rule set without a final decision.
	ruleActionBreak = 5
	// ruleActionPriority assigns a QoS bucket to the frame.
	ruleActionPriority = 6
	// ruleActionMax is the highest type code reserved for rule actions.
	ruleActionMax = 15

	// ruleMatchSourceZTAddress matches the source ZeroTier address.
	ruleMatchSourceZTAddress = 24
	// ruleMatchDestZTAddress matches the destination ZeroTier address.
	ruleMatchDestZTAddress = 25
	// ruleMatchVLANID matches the frame's VLAN identifier.
	ruleMatchVLANID = 26
	// ruleMatchVLANPCP matches the frame's VLAN priority code point.
	ruleMatchVLANPCP = 27
	// ruleMatchVLANDEI matches the frame's VLAN drop-eligible indicator.
	ruleMatchVLANDEI = 28
	// ruleMatchMACSource matches the source virtual MAC address.
	ruleMatchMACSource = 29
	// ruleMatchMACDest matches the destination virtual MAC address.
	ruleMatchMACDest = 30
	// ruleMatchIPv4Source matches the source IPv4 prefix.
	ruleMatchIPv4Source = 31
	// ruleMatchIPv4Dest matches the destination IPv4 prefix.
	ruleMatchIPv4Dest = 32
	// ruleMatchIPv6Source matches the source IPv6 prefix.
	ruleMatchIPv6Source = 33
	// ruleMatchIPv6Dest matches the destination IPv6 prefix.
	ruleMatchIPv6Dest = 34
	// ruleMatchIPTOS matches an IP traffic-class or type-of-service value.
	ruleMatchIPTOS = 35
	// ruleMatchIPProtocol matches an IP protocol or next-header value.
	ruleMatchIPProtocol = 36
	// ruleMatchEtherType matches an Ethernet protocol type.
	ruleMatchEtherType = 37
	// ruleMatchICMP matches an ICMP type, code, and flags tuple.
	ruleMatchICMP = 38
	// ruleMatchIPSourcePort matches a transport source-port range.
	ruleMatchIPSourcePort = 39
	// ruleMatchIPDestPort matches a transport destination-port range.
	ruleMatchIPDestPort = 40
	// ruleMatchCharacteristics matches frame characteristic flags.
	ruleMatchCharacteristics = 41
	// ruleMatchFrameSize matches the serialized frame-size range.
	ruleMatchFrameSize = 42
	// ruleMatchRandom applies a probabilistic match threshold.
	ruleMatchRandom = 43
	// ruleMatchTagsDifference compares the absolute difference of tag values.
	ruleMatchTagsDifference = 44
	// ruleMatchTagsBitwiseAND compares the bitwise AND of tag values.
	ruleMatchTagsBitwiseAND = 45
	// ruleMatchTagsBitwiseOR compares the bitwise OR of tag values.
	ruleMatchTagsBitwiseOR = 46
	// ruleMatchTagsBitwiseXOR compares the bitwise XOR of tag values.
	ruleMatchTagsBitwiseXOR = 47
	// ruleMatchTagsEqual compares sender and receiver tag values for equality.
	ruleMatchTagsEqual = 48
	// ruleMatchTagSender compares the sender's tag value with a fixed value.
	ruleMatchTagSender = 49
	// ruleMatchTagReceiver compares the receiver's tag value with a fixed value.
	ruleMatchTagReceiver = 50
	// ruleMatchIntegerRange compares a tag value with an inclusive range.
	ruleMatchIntegerRange = 51

	// ruleFlagOR joins a match to the following match as an alternative.
	ruleFlagOR = 0x40
	// ruleFlagNOT inverts a match result.
	ruleFlagNOT = 0x80

	// characteristicInbound marks a frame received from another member.
	characteristicInbound = uint64(0x8000000000000000)
	// characteristicMulticast marks a multicast destination.
	characteristicMulticast = uint64(0x4000000000000000)
	// characteristicBroadcast marks the Ethernet broadcast destination.
	characteristicBroadcast = uint64(0x2000000000000000)
	// characteristicIPAuth marks a frame whose IP ownership is authenticated.
	characteristicIPAuth = uint64(0x1000000000000000)
	// characteristicMACAuth marks a frame whose MAC ownership is authenticated.
	characteristicMACAuth = uint64(0x0800000000000000)
)

// NetworkRule is one action or match entry in a network rule stream.
type NetworkRule struct {
	Type  uint8
	Value []byte
}

// frameRuleContext supplies peer credentials and direction to rule evaluation.
type frameRuleContext struct {
	inbound       bool
	traceRules    bool
	sourceZT      Address
	destinationZT Address
	ownership     []CertificateOfOwnership
	localTags     []Tag
	remoteTags    []Tag
	capabilities  []Capability
	superAccept   bool
}

// ruleResult is the terminal decision produced by a rule set.
type ruleResult uint8

const (
	// ruleNoMatch leaves evaluation to a following rule set or default policy.
	ruleNoMatch ruleResult = iota
	// ruleDrop rejects the evaluated frame.
	ruleDrop
	// ruleAccept permits the evaluated frame.
	ruleAccept
)

// frameRuleDecision accumulates terminal and side-effect results from rules.
type frameRuleDecision struct {
	result        ruleResult
	super         bool
	tee           Address
	teeLength     int
	watch         bool
	additionalTee []ruleTeeDecision
	redirect      Address
	// qosBucket is parsed for wire/configuration parity. ZeroTier One's
	// Network::qosEnabled currently returns false, so its AQM scheduler does
	// not consume this value either.
	qosBucket            uint8
	ruleLog              []byte
	capabilityRuleLog    []byte
	matchingCapabilityID uint32
	matchingCapability   bool
}

// ruleTeeDecision records one additional tee or watch destination.
type ruleTeeDecision struct {
	target Address
	length int
	watch  bool
}

// ParseNetworkRules decodes the length-prefixed network rule stream.
func ParseNetworkRules(data []byte) ([]NetworkRule, error) {
	rules := make([]NetworkRule, 0, 16)
	for pos := 0; pos < len(data); {
		if len(rules) >= maxNetworkRules {
			break
		}
		if len(data)-pos < 2 {
			return nil, ErrInvalidDictionary
		}
		ruleType := data[pos]
		fieldLength := int(data[pos+1])
		pos += 2
		if ruleType&0x3f > 63 || len(data)-pos < fieldLength {
			return nil, ErrInvalidDictionary
		}
		rules = append(rules, NetworkRule{Type: ruleType, Value: append([]byte(nil), data[pos:pos+fieldLength]...)})
		pos += fieldLength
	}
	return rules, nil
}

// allowsFrame reports the terminal result of network and capability rules.
func (config NetworkConfigData) allowsFrame(frame Frame, context frameRuleContext) bool {
	return config.filterFrame(frame, context).result == ruleAccept
}

// filterFrame applies network rules before any delegated capability rules.
func (config NetworkConfigData) filterFrame(frame Frame, context frameRuleContext) frameRuleDecision {
	decision := config.evaluateRules(config.Rules, frame, context)
	if decision.result != ruleNoMatch {
		return decision
	}
	for _, capability := range context.capabilities {
		if context.inbound && absoluteDifference(capability.Timestamp, config.Timestamp) > config.CredentialTimeMaxDelta {
			continue
		}
		capabilityDecision := config.evaluateRules(capability.Rules, frame, context)
		if capabilityDecision.result == ruleAccept {
			capabilityRuleLog := capabilityDecision.ruleLog
			capabilityDecision.ruleLog = decision.ruleLog
			capabilityDecision.capabilityRuleLog = capabilityRuleLog
			capabilityDecision.matchingCapabilityID = capability.ID
			capabilityDecision.matchingCapability = true
			if !decision.tee.IsZero() {
				if !capabilityDecision.tee.IsZero() {
					capabilityDecision.additionalTee = append(capabilityDecision.additionalTee, ruleTeeDecision{
						target: capabilityDecision.tee,
						length: capabilityDecision.teeLength,
						watch:  capabilityDecision.watch,
					})
				}
				capabilityDecision.tee = decision.tee
				capabilityDecision.teeLength = decision.teeLength
				capabilityDecision.watch = decision.watch
			}
			capabilityDecision.additionalTee = append(decision.additionalTee, capabilityDecision.additionalTee...)
			return capabilityDecision
		}
	}
	return frameRuleDecision{result: ruleDrop, ruleLog: decision.ruleLog}
}

// evaluateRules evaluates one rule sequence and accumulates its side effects.
func (config NetworkConfigData) evaluateRules(rules []NetworkRule, frame Frame, context frameRuleContext) frameRuleDecision {
	setMatches := true
	skipDrop := false
	decision := frameRuleDecision{result: ruleNoMatch}
	if context.traceRules {
		decision.ruleLog = make([]byte, maxNetworkRules/2)
	}
	localAddress := context.sourceZT
	if context.inbound {
		localAddress = context.destinationZT
	}
	for ruleIndex, rule := range rules {
		ruleType := rule.Type & 0x3f
		if ruleType <= ruleActionMax {
			if !setMatches {
				if context.inbound && (ruleType == ruleActionTee || ruleType == ruleActionWatch || ruleType == ruleActionRedirect) {
					if target, _, ok := parseRuleForward(rule.Value); ok && target == localAddress {
						decision.super = true
						context.superAccept = true
					}
				}
				setMatches = true
				continue
			}
			switch ruleType {
			case ruleActionDrop:
				if skipDrop {
					skipDrop = false
					continue
				}
				decision.result = ruleDrop
				return decision
			case ruleActionBreak:
				decision.result = ruleNoMatch
				return decision
			case ruleActionAccept:
				decision.result = ruleAccept
				return decision
			case ruleActionPriority:
				if len(rule.Value) == 1 && rule.Value[0] <= 8 {
					decision.qosBucket = rule.Value[0]
				}
				decision.result = ruleAccept
				return decision
			case ruleActionTee, ruleActionWatch, ruleActionRedirect:
				target, length, ok := parseRuleForward(rule.Value)
				if !ok || target == context.sourceZT {
					continue
				}
				if target == localAddress {
					if context.inbound {
						decision.super = true
						context.superAccept = true
						decision.result = ruleAccept
						return decision
					}
					continue
				}
				if target == context.destinationZT {
					continue
				}
				if ruleType == ruleActionRedirect {
					decision.redirect = target
					decision.result = ruleAccept
					return decision
				}
				decision.tee = target
				decision.teeLength = length
				decision.watch = ruleType == ruleActionWatch
				continue
			default:
				continue
			}
		}
		if !setMatches && rule.Type&ruleFlagOR == 0 {
			logSkippedRule(decision.ruleLog, ruleIndex, setMatches)
			continue
		}
		matched := config.ruleMatches(rule, frame, context)
		logEvaluatedRule(decision.ruleLog, ruleIndex, matched, setMatches)
		if rule.Type&ruleFlagNOT != 0 {
			matched = !matched
		}
		if rule.Type&ruleFlagOR != 0 {
			setMatches = setMatches || matched
		} else {
			setMatches = setMatches && matched
		}
		if matched && config.ruleMatchSkipsDrop(rule, context) {
			skipDrop = true
		}
	}
	return decision
}

// logEvaluatedRule records one evaluated rule in the compact remote trace log.
func logEvaluatedRule(log []byte, index int, matched, setMatches bool) {
	if index < 0 || index/2 >= len(log) {
		return
	}
	value := byte(0x05)
	if matched {
		value += 0x04
	}
	if setMatches {
		value++
	}
	log[index/2] |= value << (uint(index&1) * 4)
}

// logSkippedRule records one skipped rule in the compact remote trace log.
func logSkippedRule(log []byte, index int, setMatches bool) {
	if index < 0 || index/2 >= len(log) {
		return
	}
	value := byte(1)
	if setMatches {
		value++
	}
	log[index/2] |= value << (uint(index&1) * 4)
}

// ruleMatchSkipsDrop identifies missing remote tags that preserve outbound
// compatibility instead of causing an implicit drop.
func (config NetworkConfigData) ruleMatchSkipsDrop(rule NetworkRule, context frameRuleContext) bool {
	ruleType := rule.Type & 0x3f
	if context.superAccept {
		return ruleType >= ruleMatchTagsDifference && ruleType <= ruleMatchTagReceiver
	}
	if len(rule.Value) != 8 {
		return false
	}
	id := binary.BigEndian.Uint32(rule.Value)
	switch ruleType {
	case ruleMatchTagsDifference, ruleMatchTagsBitwiseAND, ruleMatchTagsBitwiseOR, ruleMatchTagsBitwiseXOR, ruleMatchTagsEqual:
		_, localOK := findTag(context.localTags, id, config, false)
		_, remoteOK := findTag(context.remoteTags, id, config, true)
		return localOK && !remoteOK && !context.inbound
	case ruleMatchTagReceiver:
		_, remoteOK := findTag(context.remoteTags, id, config, true)
		return !context.inbound && !remoteOK
	default:
		return false
	}
}

// parseRuleForward decodes a tee, watch, or redirect action operand.
func parseRuleForward(value []byte) (Address, int, bool) {
	if len(value) != 14 {
		return 0, 0, false
	}
	target := NewAddress(binary.BigEndian.Uint64(value[:8]))
	if target.IsReserved() {
		return 0, 0, false
	}
	return target, int(binary.BigEndian.Uint16(value[12:14])), true
}

// ruleMatches evaluates one match rule against frame and context.
func (config NetworkConfigData) ruleMatches(rule NetworkRule, frame Frame, context frameRuleContext) bool {
	ruleType := rule.Type & 0x3f
	not := rule.Type&ruleFlagNOT != 0
	notApplicable := not
	value := rule.Value
	switch ruleType {
	case ruleMatchSourceZTAddress, ruleMatchDestZTAddress:
		if len(value) != AddressSize {
			return notApplicable
		}
		address, err := AddressFromBytes(value)
		if err != nil {
			return notApplicable
		}
		if ruleType == ruleMatchSourceZTAddress {
			return address == context.sourceZT
		}
		return address == context.destinationZT
	case ruleMatchVLANID:
		return len(value) == 2 && binary.BigEndian.Uint16(value) == 0
	case ruleMatchVLANPCP, ruleMatchVLANDEI:
		return len(value) == 1 && value[0] == 0
	case ruleMatchMACSource, ruleMatchMACDest:
		mac, err := MACFromBytes(value)
		if err != nil {
			return notApplicable
		}
		if ruleType == ruleMatchMACSource {
			return mac == frame.Source
		}
		return mac == frame.Destination
	case ruleMatchIPv4Source, ruleMatchIPv4Dest:
		if len(value) != 5 || frame.EtherType != EtherTypeIPv4 || len(frame.Payload) < 20 || value[4] > 32 {
			return notApplicable
		}
		prefix := netip.PrefixFrom(netip.AddrFrom4([4]byte{value[0], value[1], value[2], value[3]}), int(value[4]))
		pos := 12
		if ruleType == ruleMatchIPv4Dest {
			pos = 16
		}
		address := netip.AddrFrom4([4]byte{frame.Payload[pos], frame.Payload[pos+1], frame.Payload[pos+2], frame.Payload[pos+3]})
		return prefix.Contains(address)
	case ruleMatchIPv6Source, ruleMatchIPv6Dest:
		if len(value) != 17 || frame.EtherType != EtherTypeIPv6 || len(frame.Payload) < 40 || value[16] > 128 {
			return notApplicable
		}
		var prefixRaw, addressRaw [16]byte
		copy(prefixRaw[:], value[:16])
		pos := 8
		if ruleType == ruleMatchIPv6Dest {
			pos = 24
		}
		copy(addressRaw[:], frame.Payload[pos:pos+16])
		return netip.PrefixFrom(netip.AddrFrom16(prefixRaw), int(value[16])).Contains(netip.AddrFrom16(addressRaw))
	case ruleMatchIPTOS:
		if len(value) != 3 {
			return notApplicable
		}
		var tos byte
		if frame.EtherType == EtherTypeIPv4 && len(frame.Payload) >= 20 {
			tos = frame.Payload[1]
		} else if frame.EtherType == EtherTypeIPv6 && len(frame.Payload) >= 40 {
			tos = (frame.Payload[0] << 4) | (frame.Payload[1] >> 4)
		} else {
			return notApplicable
		}
		tos &= value[0]
		return tos >= value[1] && tos <= value[2]
	case ruleMatchIPProtocol:
		if len(value) != 1 {
			return notApplicable
		}
		if frame.EtherType == EtherTypeIPv4 {
			return len(frame.Payload) >= 20 && frame.Payload[9] == value[0]
		}
		_, protocol, ok := ipPayload(frame.EtherType, frame.Payload)
		return ok && protocol == value[0]
	case ruleMatchEtherType:
		return len(value) == 2 && binary.BigEndian.Uint16(value) == frame.EtherType
	case ruleMatchICMP:
		if len(value) != 3 {
			return notApplicable
		}
		pos, protocol, ok := ipPayload(frame.EtherType, frame.Payload)
		if !ok || (protocol != 1 && protocol != 58) || len(frame.Payload)-pos < 2 || frame.Payload[pos] != value[0] {
			return notApplicable
		}
		if value[2]&1 == 0 {
			// ZeroTier's hardYes result remains true even when the rule carries
			// NOT. It is used when the ICMP type alone completes the match.
			return !not
		}
		return frame.Payload[pos+1] == value[1]
	case ruleMatchIPSourcePort, ruleMatchIPDestPort:
		if len(value) != 4 {
			return notApplicable
		}
		pos, protocol, ok := ipPayload(frame.EtherType, frame.Payload)
		if !ok || (protocol != 6 && protocol != 17 && protocol != 132 && protocol != 136) || len(frame.Payload)-pos <= 4 {
			return notApplicable
		}
		if ruleType == ruleMatchIPDestPort {
			pos += 2
		}
		port := binary.BigEndian.Uint16(frame.Payload[pos : pos+2])
		if frame.EtherType == EtherTypeIPv6 && port == 0 {
			return false
		}
		return port >= binary.BigEndian.Uint16(value[:2]) && port <= binary.BigEndian.Uint16(value[2:4])
	case ruleMatchCharacteristics:
		if len(value) != 8 {
			return notApplicable
		}
		requested := binary.BigEndian.Uint64(value)
		var characteristics uint64
		if context.inbound {
			characteristics |= characteristicInbound
		}
		if frame.Destination.IsMulticast() {
			characteristics |= characteristicMulticast
		}
		if frame.Destination.IsBroadcast() {
			characteristics |= characteristicBroadcast
		}
		if requested&(characteristicIPAuth|characteristicMACAuth) != 0 {
			if requested&characteristicIPAuth != 0 && ipv6NeighborSolicitation(frame) {
				characteristics |= characteristicIPAuth
			}
			for _, certificate := range context.ownership {
				if context.inbound && absoluteDifference(certificate.Timestamp, config.Timestamp) > config.CredentialTimeMaxDelta {
					continue
				}
				if characteristics&characteristicMACAuth == 0 && certificate.OwnsMAC(frame.Source) {
					characteristics |= characteristicMACAuth
				}
				if characteristics&characteristicIPAuth == 0 {
					if sourceIP, ok := frameSourceIP(frame); ok && certificate.OwnsIP(sourceIP) {
						characteristics |= characteristicIPAuth
					}
				}
			}
		}
		pos, protocol, ok := ipPayload(frame.EtherType, frame.Payload)
		if ok && protocol == 6 && len(frame.Payload)-pos > 13 {
			characteristics |= uint64(frame.Payload[pos+13])
			characteristics |= uint64(frame.Payload[pos+12]&0x0f) << 8
		}
		return characteristics&requested != 0
	case ruleMatchFrameSize:
		return len(value) == 4 && len(frame.Payload) >= int(binary.BigEndian.Uint16(value[:2])) && len(frame.Payload) <= int(binary.BigEndian.Uint16(value[2:4]))
	case ruleMatchRandom:
		if len(value) != 4 {
			return notApplicable
		}
		var random [4]byte
		if _, err := rand.Read(random[:]); err != nil {
			return false
		}
		return binary.BigEndian.Uint32(random[:]) <= binary.BigEndian.Uint32(value)
	case ruleMatchTagsDifference, ruleMatchTagsBitwiseAND, ruleMatchTagsBitwiseOR, ruleMatchTagsBitwiseXOR, ruleMatchTagsEqual:
		if len(value) != 8 {
			return notApplicable
		}
		id, expected := binary.BigEndian.Uint32(value), binary.BigEndian.Uint32(value[4:])
		localTag, localOK := findTag(context.localTags, id, config, false)
		if !localOK {
			return notApplicable
		}
		remoteTag, remoteOK := findTag(context.remoteTags, id, config, true)
		if !remoteOK {
			if context.superAccept || !context.inbound {
				return !not
			}
			return notApplicable
		}
		switch ruleType {
		case ruleMatchTagsDifference:
			difference := localTag.Value
			if remoteTag.Value > difference {
				difference = remoteTag.Value - difference
			} else {
				difference -= remoteTag.Value
			}
			return difference <= expected
		case ruleMatchTagsBitwiseAND:
			return localTag.Value&remoteTag.Value == expected
		case ruleMatchTagsBitwiseOR:
			return localTag.Value|remoteTag.Value == expected
		case ruleMatchTagsBitwiseXOR:
			return localTag.Value^remoteTag.Value == expected
		default:
			return localTag.Value == expected && remoteTag.Value == expected
		}
	case ruleMatchTagSender, ruleMatchTagReceiver:
		if len(value) != 8 {
			return notApplicable
		}
		id, expected := binary.BigEndian.Uint32(value), binary.BigEndian.Uint32(value[4:])
		if context.superAccept {
			return !not
		}
		useRemote := (ruleType == ruleMatchTagSender && context.inbound) || (ruleType == ruleMatchTagReceiver && !context.inbound)
		if useRemote {
			tag, ok := findTag(context.remoteTags, id, config, true)
			if !ok {
				if !context.inbound && ruleType == ruleMatchTagReceiver {
					return !not
				}
				return notApplicable
			}
			return tag.Value == expected
		}
		tag, ok := findTag(context.localTags, id, config, false)
		return ok && tag.Value == expected
	case ruleMatchIntegerRange:
		return matchIntegerRange(value, frame.Payload)
	default:
		return config.Flags&0x08 != 0
	}
}

// findTag locates a tag and applies remote credential freshness validation.
func findTag(tags []Tag, id uint32, config NetworkConfigData, remote bool) (Tag, bool) {
	for _, tag := range tags {
		if tag.ID != id {
			continue
		}
		if remote && absoluteDifference(tag.Timestamp, config.Timestamp) > config.CredentialTimeMaxDelta {
			return Tag{}, false
		}
		return tag, true
	}
	return Tag{}, false
}

// frameSourceIP extracts the asserted source IP from IPv4, IPv6, NDP, or ARP.
func frameSourceIP(frame Frame) (netip.Addr, bool) {
	switch frame.EtherType {
	case EtherTypeIPv4:
		if len(frame.Payload) >= 20 {
			return netip.AddrFrom4([4]byte{frame.Payload[12], frame.Payload[13], frame.Payload[14], frame.Payload[15]}), true
		}
	case EtherTypeIPv6:
		if len(frame.Payload) >= 40 {
			var value [16]byte
			if len(frame.Payload) >= 64 && frame.Payload[6] == 58 && frame.Payload[40] == 136 {
				copy(value[:], frame.Payload[48:64])
			} else {
				copy(value[:], frame.Payload[8:24])
			}
			return netip.AddrFrom16(value), true
		}
	case EtherTypeARP:
		if len(frame.Payload) >= 28 {
			return netip.AddrFrom4([4]byte{frame.Payload[14], frame.Payload[15], frame.Payload[16], frame.Payload[17]}), true
		}
	}
	return netip.Addr{}, false
}

// ipv6NeighborSolicitation reports whether frame carries an ICMPv6 neighbor
// solicitation.
func ipv6NeighborSolicitation(frame Frame) bool {
	return frame.EtherType == EtherTypeIPv6 && len(frame.Payload) >= 64 && frame.Payload[6] == 58 && frame.Payload[40] == 135
}

// ipPayload locates the transport payload after IPv4 or supported IPv6 headers.
func ipPayload(etherType uint16, packet []byte) (int, byte, bool) {
	if etherType == EtherTypeIPv4 {
		if len(packet) < 20 {
			return 0, 0, false
		}
		pos := int(packet[0]&0x0f) * 4
		return pos, packet[9], pos <= len(packet)
	}
	if etherType != EtherTypeIPv6 || len(packet) < 40 {
		return 0, 0, false
	}
	pos, protocol := 40, packet[6]
	for pos <= len(packet) {
		switch protocol {
		case 0, 43, 60, 135:
			if len(packet)-pos < 8 {
				return 0, 0, false
			}
			protocol = packet[pos]
			pos += int(packet[pos+1])*8 + 8
		default:
			return pos, protocol, pos <= len(packet)
		}
	}
	return 0, 0, false
}

// matchIntegerRange evaluates a rule's bit-width, byte-order, and range operand.
func matchIntegerRange(value, payload []byte) bool {
	if len(value) != 19 {
		return false
	}
	start := binary.BigEndian.Uint64(value[:8])
	end := start + uint64(uint32(binary.BigEndian.Uint64(value[8:16])-start))
	index := int(binary.BigEndian.Uint16(value[16:18]))
	format := value[18]
	bits := int(format&63) + 1
	bytes := (bits + 7) / 8
	if format&0x80 == 0 {
		index += 8 - bytes
	}
	var integer uint64
	if index >= 0 && index <= len(payload) && len(payload)-index >= bytes {
		if format&0x80 == 0 {
			for _, b := range payload[index : index+bytes] {
				integer = integer<<8 | uint64(b)
			}
		} else {
			for i := bytes - 1; i >= 0; i-- {
				integer = integer<<8 | uint64(payload[index+i])
			}
		}
	}
	if bits < 64 {
		integer &= uint64(1)<<bits - 1
	}
	return integer >= start && integer <= end
}
