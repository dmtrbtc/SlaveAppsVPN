import test from 'node:test'
import assert from 'node:assert/strict'
import { parseGitHubReleasesAtom } from '../src/shared/update/parseGitHubReleasesAtom.ts'

test('release tag comes from canonical href, not the editable Atom title', () => {
  const [release] = parseGitHubReleasesAtom(`
    <feed>
      <entry>
        <title>SLAVE VPN v0.2.41-dev.7</title>
        <updated>2026-08-30T17:45:15Z</updated>
        <link rel="alternate" href="https://github.com/dmtrbtc/SlaveAppsVPN/releases/tag/v0.2.41-dev.7" />
        <content type="html">Config boundary &amp; updater fix</content>
      </entry>
    </feed>
  `)

  assert.ok(release)
  assert.equal(release.tag_name, 'v0.2.41-dev.7')
  assert.equal(release.name, 'SLAVE VPN v0.2.41-dev.7')
  assert.equal(release.prerelease, true)
  assert.equal(
    `https://github.com/dmtrbtc/SlaveAppsVPN/releases/download/${release.tag_name}/SlaveAppsVPN-Android.apk`,
    'https://github.com/dmtrbtc/SlaveAppsVPN/releases/download/v0.2.41-dev.7/SlaveAppsVPN-Android.apk',
  )
})

test('encoded href tags are decoded and title remains a legacy fallback', () => {
  const releases = parseGitHubReleasesAtom(`
    <feed>
      <entry>
        <title>Human readable name</title>
        <link href="https://github.com/example/app/releases/tag/v0%2E3%2E0-rc%2E1" />
      </entry>
      <entry>
        <title>v0.2.40</title>
      </entry>
    </feed>
  `)

  assert.equal(releases[0]?.tag_name, 'v0.3.0-rc.1')
  assert.equal(releases[0]?.prerelease, true)
  assert.equal(releases[1]?.tag_name, 'v0.2.40')
  assert.equal(releases[1]?.prerelease, false)
})
