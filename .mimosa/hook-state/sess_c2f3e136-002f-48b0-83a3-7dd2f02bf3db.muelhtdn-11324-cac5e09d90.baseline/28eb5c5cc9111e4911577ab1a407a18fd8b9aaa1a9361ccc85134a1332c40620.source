export interface GitHubReleaseAsset {
  name: string
  browser_download_url: string
}

export interface GitHubRelease {
  tag_name: string
  name: string | null
  body: string | null
  html_url: string
  draft: boolean
  prerelease: boolean
  published_at: string
  assets: GitHubReleaseAsset[]
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

function tagFromReleaseHref(href: string): string | null {
  const match = /\/releases\/tag\/([^/?#]+)/.exec(decodeXmlEntities(href))
  if (!match?.[1]) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

/**
 * Parse GitHub's releases.atom into the REST-like shape consumed by both
 * updater platforms.
 *
 * GitHub uses the editable release title for <title>; it is not guaranteed to
 * equal the immutable tag. The canonical tag lives in the /releases/tag/ link.
 * Title is kept only as a compatibility fallback for synthetic/legacy feeds.
 */
export function parseGitHubReleasesAtom(xml: string): GitHubRelease[] {
  const out: GitHubRelease[] = []
  for (const entry of xml.split('<entry>').slice(1)) {
    const title = decodeXmlEntities(/<title>([^<]+)<\/title>/.exec(entry)?.[1]?.trim() ?? '')
    const rawHref = /<link[^>]*href="([^"]+)"/.exec(entry)?.[1] ?? ''
    const href = decodeXmlEntities(rawHref)
    const tag = tagFromReleaseHref(rawHref) ?? title
    if (!tag) continue

    const updated = /<updated>([^<]+)<\/updated>/.exec(entry)?.[1]?.trim() ?? ''
    const content = /<content[^>]*>([\s\S]*?)<\/content>/.exec(entry)?.[1] ?? ''
    out.push({
      tag_name: tag,
      name: title || tag,
      body: decodeXmlEntities(content).replace(/<[^>]+>/g, '').trim(),
      html_url: href || `https://github.com/dmtrbtc/SlaveAppsVPN/releases/tag/${encodeURIComponent(tag)}`,
      draft: false,
      prerelease: /-(?:dev|rc|alpha|beta)/i.test(tag),
      published_at: updated,
      assets: [],
    })
  }
  return out
}
