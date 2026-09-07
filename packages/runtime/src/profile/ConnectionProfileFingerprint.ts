import { createHash } from 'crypto'
import yaml from 'js-yaml'
import type { ConnectionProfile } from '../engine/VPNEngine.interface'

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    const input = value as Record<string, unknown>
    const output: Record<string, unknown> = {}
    for (const key of Object.keys(input).sort()) {
      if (input[key] !== undefined) output[key] = canonicalize(input[key])
    }
    return output
  }
  return value
}

function normalizedProfile(profile: ConnectionProfile): unknown {
  return canonicalize({
    ...profile,
    // Subscription parsing/generation is semantic; line endings and trailing
    // whitespace from a provider must not force a Mihomo config reload.
    subscriptionYaml: normalizeYaml(profile.subscriptionYaml),
  })
}

function normalizeYaml(input: string): unknown {
  try {
    return canonicalize(yaml.load(input, { schema: yaml.JSON_SCHEMA }))
  } catch {
    // Invalid input must still reach normal engine validation; do not equate it
    // to an empty valid document or hide a provider parse error.
    return input.replace(/\r\n?/g, '\n').trim()
  }
}

export function fingerprintConnectionProfile(profile: ConnectionProfile): string {
  return createHash('sha256')
    .update(JSON.stringify(normalizedProfile(profile)))
    .digest('hex')
}

export function connectionProfilesEqual(
  previous: ConnectionProfile,
  next: ConnectionProfile,
): boolean {
  return fingerprintConnectionProfile(previous) === fingerprintConnectionProfile(next)
}

export function diffConnectionProfiles(
  previous: ConnectionProfile | null,
  next: ConnectionProfile,
): string[] {
  if (!previous) return ['initial']
  const fields: Array<keyof ConnectionProfile> = [
    'subscriptionYaml',
    'selectedProxy',
    'vpnMode',
    'generatorSettings',
    'dnsProfile',
    'routingPolicy',
    'utlsFingerprint',
  ]
  return fields.filter((field) => {
    const left = field === 'subscriptionYaml'
      ? normalizeYaml(String(previous[field] ?? ''))
      : canonicalize(previous[field])
    const right = field === 'subscriptionYaml'
      ? normalizeYaml(String(next[field] ?? ''))
      : canonicalize(next[field])
    return JSON.stringify(left) !== JSON.stringify(right)
  })
}
