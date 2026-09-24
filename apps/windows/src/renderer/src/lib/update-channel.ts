/**
 * Effective update channel resolution.
 *
 * A prerelease BUILD (-dev/-rc/-alpha/-beta suffix in its own version) can only
 * ever be superseded by another prerelease — the newest final release is
 * strictly older by semver, so a 'stable' channel filter would silently hide
 * every update from anyone running a dev build that never switched the
 * channel selector (the default is 'stable'). Derived-effective channeling
 * keeps the stored preference untouched while making the check honest.
 */

const PRERELEASE_SUFFIX_RE = /-(?:dev|rc|alpha|beta)(?:[.\d]|$)/i

export type UpdateChannelPreference = 'stable' | 'beta'

/** True when the given version string carries a prerelease suffix (0.2.41-dev.18, 1.0.0-rc.1…). */
export function isPrereleaseVersion(version: string): boolean {
  return PRERELEASE_SUFFIX_RE.test(version.trim())
}

/**
 * The channel updates are actually looked up in: a prerelease build is always
 * served from 'beta' regardless of the stored 'stable' preference; an explicit
 * 'beta' preference is never downgraded; release builds follow the preference.
 */
export function effectiveUpdateChannel(
  stored: UpdateChannelPreference,
  currentVersion: string
): UpdateChannelPreference {
  return stored === 'stable' && isPrereleaseVersion(currentVersion) ? 'beta' : stored
}
