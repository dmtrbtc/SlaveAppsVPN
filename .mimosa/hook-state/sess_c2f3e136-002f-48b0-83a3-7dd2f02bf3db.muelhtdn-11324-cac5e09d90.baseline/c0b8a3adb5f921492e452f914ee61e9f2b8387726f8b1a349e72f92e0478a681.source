import type { DnsProfile } from '../profiles/DnsProfile'

export interface DnsValidationError {
  readonly code: string
  readonly message: string
  readonly field?: string
}

export interface DnsValidationResult {
  readonly valid: boolean
  readonly errors: readonly DnsValidationError[]
}

export class DnsValidator {
  validate(profile: DnsProfile): DnsValidationResult {
    const errors: DnsValidationError[] = []

    if (!profile.nameservers || profile.nameservers.length === 0) {
      errors.push({ code: 'NO_NAMESERVERS', message: 'At least one nameserver is required', field: 'nameservers' })
    }

    for (const ns of profile.nameservers) {
      if (!ns.url || ns.url.trim().length === 0) {
        errors.push({ code: 'EMPTY_NAMESERVER_URL', message: 'Nameserver URL cannot be empty', field: 'nameservers' })
      }
    }

    if (profile.fakeIp.enabled) {
      if (profile.mode !== 'fake-ip') {
        errors.push({
          code: 'FAKE_IP_MODE_MISMATCH',
          message: 'fakeIp.enabled requires mode to be "fake-ip"',
          field: 'mode',
        })
      }
      if (!profile.fakeIp.range || !/^\d+\.\d+\.\d+\.\d+\/\d+$/.test(profile.fakeIp.range)) {
        errors.push({
          code: 'INVALID_FAKE_IP_RANGE',
          message: `Invalid fake-ip CIDR range: ${profile.fakeIp.range}`,
          field: 'fakeIp.range',
        })
      }
    }

    if (profile.leakPrevention.enabled && profile.leakPrevention.fallbackFilter) {
      const ff = profile.leakPrevention.fallbackFilter
      if (!ff.geoipCode || ff.geoipCode.trim().length === 0) {
        errors.push({ code: 'EMPTY_GEOIP_CODE', message: 'fallbackFilter.geoipCode cannot be empty', field: 'leakPrevention.fallbackFilter.geoipCode' })
      }
    }

    return { valid: errors.length === 0, errors }
  }
}
