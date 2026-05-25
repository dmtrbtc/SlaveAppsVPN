import type { RoutingRule, RuleTargetType, RuleAction } from '../models/RoutingRule'
import type { RoutingScenario } from './types'

const STREAMING_DOMAINS: readonly string[] = [
  // Netflix
  'netflix.com', 'nflxext.com', 'nflximg.com', 'nflximg.net', 'nflxso.net', 'nflxvideo.net',
  // YouTube
  'youtube.com', 'youtu.be', 'googlevideo.com', 'ytimg.com', 'yt3.ggpht.com',
  // Twitch
  'twitch.tv', 'twitchsvc.net', 'jtvnw.net', 'twitchcdn.net',
  // Amazon Prime Video
  'primevideo.com', 'aiv-cdn.net', 'aiv-delivery.net', 'amazonvideo.com',
  // Hulu
  'hulu.com', 'hulustream.com',
  // HBO Max
  'hbomax.com', 'max.com', 'hbo.com',
  // Disney+
  'disneyplus.com', 'disney-plus.net', 'bamgrid.com',
  // Apple TV
  'tv.apple.com', 'appletvplus.com',
  // Spotify
  'spotify.com', 'scdn.co', 'spotifycdn.com',
  // SoundCloud
  'soundcloud.com', 'sndcdn.com',
  // Tidal
  'tidal.com', 'tidalhifi.com',
  // Deezer
  'deezer.com', 'dzcdn.net',
  // Crunchyroll
  'crunchyroll.com', 'crunchyrollsvc.com',
  // Vimeo
  'vimeo.com', 'vimeocdn.com',
  // TikTok
  'tiktok.com', 'tiktokcdn.com', 'musical.ly', 'tiktokv.com',
]

let _id = 0
function nextId(prefix: string): string {
  return `${prefix}:${++_id}`
}

function rule(type: RuleTargetType, value: string, action: RuleAction, priority: number): RoutingRule {
  return {
    id: nextId(`streaming:${type}:${value}`),
    target: { type, value },
    action,
    priority,
    source: { provider: 'scenario:streaming', category: 'streaming' },
  }
}

function buildRules(): readonly RoutingRule[] {
  // Priority 1200-1299: streaming overrides general bypass (which starts at 1500)
  let p = 1200
  return STREAMING_DOMAINS.map(d => rule('domain_suffix', d, 'proxy', p++))
}

export function createStreamingScenario(): RoutingScenario {
  return {
    id: 'streaming',
    name: 'Стриминг',
    description: 'Netflix, YouTube, Twitch, Prime Video, Spotify через VPN.',
    category: 'streaming',
    icon: 'Play',
    defaultEnabled: false,
    composable: true,
    rules: buildRules(),
    defaultAction: null,
  }
}
