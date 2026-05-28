import { parseProxyUriSafe } from '@slave-vpn/config'

/**
 * Browser-side clipboard detector. Returns the same shape as Windows IPC's
 * ClipboardDetectResult so the renderer hook (useClipboardSuggestion) works
 * identically.
 *
 * Reads the clipboard via navigator.clipboard.readText() — works in any
 * modern WebView (Android 8+). If the user denied clipboard permission,
 * the read throws and we return {found: false}.
 */

const VPN_URI_PATTERN = /\b(vless|vmess|trojan|ss|hysteria2?|tuic|wireguard|wg):\/\/[^\s]+/i
// A bare https URL that *might* be a subscription. We trim trailing chars
// that often hitchhike from copy/paste (commas, periods, parens, quotes).
const SUB_URL_PATTERN = /^(https?:\/\/[^\s,()'"<>]+)/i

interface ClipboardDetectResult {
  found: boolean
  scheme?: string
  input?: string
  preview?: { name: string; protocol: string; transport: string; security: string }
}

export async function detectClipboardLink(): Promise<ClipboardDetectResult> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
    return { found: false }
  }
  let text: string
  try {
    text = await navigator.clipboard.readText()
  } catch {
    // Permission denied or empty
    return { found: false }
  }
  if (!text || !text.trim()) return { found: false }
  const trimmed = text.trim()

  // 1) VPN URI (vless://, vmess://, …)
  const uriMatch = trimmed.match(VPN_URI_PATTERN)
  if (uriMatch) {
    const uri = uriMatch[0]
    const scheme = (uriMatch[1] ?? '').toLowerCase()
    try {
      const parsed = parseProxyUriSafe(uri)
      if (parsed) {
        const extra = parsed.extra as Record<string, unknown>
        const transport = typeof extra['network'] === 'string' ? (extra['network'] as string) : 'tcp'
        const security = extra['tls'] === true
          ? (typeof extra['security'] === 'string' && extra['security'] === 'reality' ? 'reality' : 'tls')
          : 'none'
        return {
          found: true,
          scheme,
          input: uri,
          preview: {
            name: parsed.name,
            protocol: parsed.type,
            transport,
            security,
          },
        }
      }
    } catch {
      /* fall through */
    }
    return { found: true, scheme, input: uri }
  }

  // 2) Plain subscription URL (https://...) — heuristic
  const urlMatch = trimmed.match(SUB_URL_PATTERN)
  if (urlMatch) {
    const url = urlMatch[1]
    if (!url) return { found: false }
    // Filter out obvious non-subscription URLs (homepages, social media)
    try {
      const u = new URL(url)
      // Be permissive — any https URL the user copied could be a subscription
      const looksLikeSubscription =
        /\/(sub|subscribe|api|clash|v2ray|singbox)/i.test(u.pathname) ||
        /\.(yaml|yml|txt|json)(\?|$)/i.test(u.pathname) ||
        u.search.includes('token=') ||
        u.search.includes('access=')
      if (looksLikeSubscription || u.pathname.length > 1) {
        return {
          found: true,
          scheme: 'https',
          input: url,
        }
      }
    } catch {
      /* fall through */
    }
  }

  return { found: false }
}
