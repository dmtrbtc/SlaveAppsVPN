import type { RoutingRule } from '../models/RoutingRule'

let _nextPriority = 2000

function rule(type: RoutingRule['target']['type'], value: string): RoutingRule {
  const priority = _nextPriority++
  return {
    id: `bypass:${type}:${value}`,
    target: { type, value },
    action: 'proxy',
    priority,
    source: { provider: 'bundled-bypass', category: 'russia-bypass' },
  }
}

function suffix(value: string): RoutingRule { return rule('domain_suffix', value) }
function domain(value: string): RoutingRule { return rule('domain', value) }

export const RUSSIA_BYPASS_RULES: readonly RoutingRule[] = [
  // YouTube
  suffix('youtube.com'),
  suffix('youtu.be'),
  suffix('googlevideo.com'),
  suffix('ytimg.com'),
  suffix('yt3.ggpht.com'),
  domain('yt.be'),

  // Discord
  suffix('discord.com'),
  suffix('discord.gg'),
  suffix('discordapp.com'),
  suffix('discordapp.net'),
  suffix('discord.media'),
  suffix('discordcdn.com'),

  // Twitter / X
  suffix('twitter.com'),
  suffix('x.com'),
  suffix('t.co'),
  suffix('twimg.com'),
  suffix('tweetdeck.com'),

  // Instagram / Facebook / Meta
  suffix('instagram.com'),
  suffix('facebook.com'),
  suffix('fb.com'),
  suffix('fbcdn.net'),
  suffix('messenger.com'),
  suffix('meta.com'),
  suffix('cdninstagram.com'),

  // LinkedIn
  suffix('linkedin.com'),
  suffix('licdn.com'),

  // Reddit
  suffix('reddit.com'),
  suffix('redd.it'),
  suffix('redditmedia.com'),
  suffix('reddituploads.com'),
  suffix('redditstatic.com'),
  suffix('reddit.map.fastly.net'),

  // Twitch
  suffix('twitch.tv'),
  suffix('twitchsvc.net'),
  suffix('jtvnw.net'),
  suffix('twitchdiscover.com'),

  // Spotify
  suffix('spotify.com'),
  suffix('scdn.co'),
  suffix('spotifycdn.com'),

  // SoundCloud
  suffix('soundcloud.com'),
  suffix('sndcdn.com'),

  // Patreon
  suffix('patreon.com'),
  suffix('patreonusercontent.com'),

  // Medium
  suffix('medium.com'),

  // GitHub (blocked in some regions)
  // Not included by default — controversial

  // AI services
  suffix('openai.com'),
  suffix('chatgpt.com'),
  suffix('oaistatic.com'),
  suffix('oaiusercontent.com'),
  suffix('claude.ai'),
  suffix('anthropic.com'),
  suffix('gemini.google.com'),
  suffix('bard.google.com'),
  suffix('makersuite.google.com'),
  suffix('deepmind.com'),
  suffix('deepmind.google'),
  suffix('cohere.ai'),
  suffix('cohere.com'),
  suffix('mistral.ai'),
  suffix('huggingface.co'),

  // Notion (blocked in Russia)
  suffix('notion.so'),
  suffix('notion.com'),

  // Figma
  suffix('figma.com'),
  suffix('fig.io'),

  // Canva
  suffix('canva.com'),

  // Trello / Atlassian
  suffix('trello.com'),
  suffix('atlassian.com'),
  suffix('atlassian.net'),
  suffix('atlassian.io'),

  // Slack
  suffix('slack.com'),
  suffix('slack-edge.com'),
  suffix('slack-imgs.com'),

  // Zoom (partially restricted)
  suffix('zoom.us'),
  suffix('zoom.com'),

  // Pinterest
  suffix('pinterest.com'),
  suffix('pinimg.com'),

  // Tumblr
  suffix('tumblr.com'),

  // Flickr
  suffix('flickr.com'),
  suffix('staticflickr.com'),

  // Vimeo
  suffix('vimeo.com'),
  suffix('vimeocdn.com'),

  // Quora
  suffix('quora.com'),
  suffix('quoracdn.net'),

  // Signal (blocked in Russia)
  suffix('signal.org'),
  suffix('whispersystems.org'),
  suffix('signal.group'),

  // Tor Project
  suffix('torproject.org'),
]

export const RUSSIA_BYPASS_PRIVATE_DIRECT: readonly RoutingRule[] = [
  { id: 'private:192.168.0.0/16', target: { type: 'ip_cidr', value: '192.168.0.0/16' }, action: 'direct', priority: 1000, noResolve: true, source: { provider: 'bundled-bypass', category: 'private' } },
  { id: 'private:10.0.0.0/8',     target: { type: 'ip_cidr', value: '10.0.0.0/8'     }, action: 'direct', priority: 1001, noResolve: true, source: { provider: 'bundled-bypass', category: 'private' } },
  { id: 'private:172.16.0.0/12',  target: { type: 'ip_cidr', value: '172.16.0.0/12'  }, action: 'direct', priority: 1002, noResolve: true, source: { provider: 'bundled-bypass', category: 'private' } },
  { id: 'private:127.0.0.0/8',    target: { type: 'ip_cidr', value: '127.0.0.0/8'    }, action: 'direct', priority: 1003, noResolve: true, source: { provider: 'bundled-bypass', category: 'private' } },
  { id: 'private:fc00::/7',        target: { type: 'ip_cidr', value: 'fc00::/7'       }, action: 'direct', priority: 1004, noResolve: true, source: { provider: 'bundled-bypass', category: 'private' } },
  { id: 'private:::1/128',         target: { type: 'ip_cidr', value: '::1/128'        }, action: 'direct', priority: 1005, noResolve: true, source: { provider: 'bundled-bypass', category: 'private' } },
]
