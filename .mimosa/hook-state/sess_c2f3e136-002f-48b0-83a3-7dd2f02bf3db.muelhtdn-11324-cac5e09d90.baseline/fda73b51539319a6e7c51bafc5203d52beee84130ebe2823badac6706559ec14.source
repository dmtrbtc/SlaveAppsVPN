import type { RoutingRule } from '../models/RoutingRule'

export type ScenarioCategory =
  | 'bypass'      // Smart Russia Bypass, Smart Global
  | 'block'       // AdBlock, malware, tracker block
  | 'streaming'   // Netflix, YouTube, Twitch
  | 'ai'          // OpenAI, Anthropic, Gemini
  | 'gaming'      // Steam, Riot, EA
  | 'work'        // Notion, Figma, Slack
  | 'privacy'     // Signal, Tor
  | 'custom'

export type ScenarioId =
  | 'smart-russia-bypass'
  | 'smart-global'
  | 'ad-block'
  | 'streaming'
  | 'ai-services'
  | 'gaming-direct'
  | 'runetfreedom-bypass'
  | 'roscomvpn-default'

export interface RoutingScenario {
  readonly id: ScenarioId
  readonly name: string
  readonly description: string
  readonly category: ScenarioCategory
  readonly icon: string             // lucide icon name
  readonly defaultEnabled: boolean
  readonly composable: boolean      // can be combined with other scenarios
  readonly rules: readonly RoutingRule[]
  // null = scenario only contributes rules, does not override default action
  readonly defaultAction: 'proxy' | 'direct' | null
}

export interface ScenarioMetadata {
  readonly id: ScenarioId
  readonly name: string
  readonly description: string
  readonly category: ScenarioCategory
  readonly icon: string
  readonly defaultEnabled: boolean
  readonly composable: boolean
  readonly ruleCount: number
  // True when the scenario sets the default action (defaultAction != null) — it
  // defines the base routing behaviour. The UI groups these as «База» (pick one)
  // vs additive «Дополнения» (isBase=false, stack freely).
  readonly isBase: boolean
}
