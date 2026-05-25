import type { RoutingRule, RuleTargetType, RuleAction } from '../models/RoutingRule'
import type { RoutingScenario } from './types'

// Gaming domains stay DIRECT to keep latency low — VPN adds 30-100ms of jitter.
const GAMING_DOMAINS: readonly string[] = [
  // Steam
  'steampowered.com', 'steamcommunity.com', 'steamstatic.com', 'steamcontent.com',
  'steamusercontent.com', 'akamaihd.net',
  // Riot Games
  'riotgames.com', 'leagueoflegends.com', 'valorant.com',
  // Battle.net / Blizzard
  'battle.net', 'blizzard.com', 'blizzardentertainment.com', 'bnet.cdn.blizzard.com',
  // EA
  'ea.com', 'origin.com', 'easports.com',
  // Epic Games
  'epicgames.com', 'unrealengine.com', 'fortnite.com',
  // Ubisoft
  'ubisoft.com', 'ubi.com', 'uplay.com',
  // Take-Two / Rockstar
  'rockstargames.com', 'socialclub.rockstargames.com', '2k.com',
  // Activision
  'activision.com', 'callofduty.com',
  // Nintendo
  'nintendo.com', 'nintendo.net', 'nintendoswitch.com',
  // PlayStation
  'playstation.com', 'playstation.net', 'sonyentertainmentnetwork.com',
  // Xbox
  'xbox.com', 'xboxlive.com', 'xboxservices.com',
  // Mojang / Minecraft
  'minecraft.net', 'mojang.com',
  // Roblox
  'roblox.com', 'rbxcdn.com',
  // Discord (voice — direct for low latency)
  'discord.media',
]

let _id = 0
function nextId(prefix: string): string {
  return `${prefix}:${++_id}`
}

function rule(type: RuleTargetType, value: string, action: RuleAction, priority: number): RoutingRule {
  return {
    id: nextId(`gaming:${type}:${value}`),
    target: { type, value },
    action,
    priority,
    source: { provider: 'scenario:gaming-direct', category: 'gaming' },
  }
}

function buildRules(): readonly RoutingRule[] {
  // Priority 800-899: gaming "keep direct" runs before bypass rules
  let p = 800
  return GAMING_DOMAINS.map(d => rule('domain_suffix', d, 'direct', p++))
}

export function createGamingScenario(): RoutingScenario {
  return {
    id: 'gaming-direct',
    name: 'Игры',
    description: 'Steam, Riot, Blizzard, EA — напрямую (низкий пинг).',
    category: 'gaming',
    icon: 'Gamepad2',
    defaultEnabled: false,
    composable: true,
    rules: buildRules(),
    defaultAction: null,
  }
}
