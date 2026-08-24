import type { RoutingRule, RuleTargetType, RuleAction } from '../models/RoutingRule'
import type { RoutingScenario } from './types'

const AI_DOMAINS: readonly string[] = [
  // OpenAI
  'openai.com', 'chatgpt.com', 'oaistatic.com', 'oaiusercontent.com',
  'auth0.openai.com', 'cdn.openai.com',
  // Anthropic
  'claude.ai', 'anthropic.com', 'cdn.anthropic.com',
  // Google AI
  'gemini.google.com', 'bard.google.com', 'aistudio.google.com', 'ai.google.dev',
  'makersuite.google.com', 'generativelanguage.googleapis.com',
  // Microsoft / Copilot
  'copilot.microsoft.com', 'bing.com/chat',
  // Meta AI
  'meta.ai', 'llama.meta.com',
  // Mistral
  'mistral.ai', 'chat.mistral.ai',
  // Cohere
  'cohere.ai', 'cohere.com',
  // HuggingFace
  'huggingface.co', 'hf.co',
  // Perplexity
  'perplexity.ai',
  // Character / Replika
  'character.ai', 'replika.ai',
  // Stable / Midjourney
  'midjourney.com', 'stability.ai',
  // DeepMind
  'deepmind.com', 'deepmind.google',
  // Notable
  'phind.com', 'you.com',
]

// Gemini loads a number of shared Google endpoints after the main page opens.
// Keep this list host-specific: routing all of google.com/googleapis.com through
// the tunnel would violate the semantics of «Только заблокированное».
// Source: Google Workspace Admin Help — "Gemini App firewall settings".
const GEMINI_REQUIRED_DOMAINS: readonly string[] = [
  // Google Account sign-in
  'accounts.google.com',
  // Gemini API, app shell and capability endpoints
  'www.googleapis.com',
  'jnn-pa.googleapis.com',
  'waa-pa.clients6.google.com',
  'ogads-pa.clients6.google.com',
  'optimizationguide-pa.googleapis.com',
  'streetviewpixels-pa.googleapis.com',
  'content-autofill.googleapis.com',
  // Shared UI, fonts, images and media used by the Gemini web app
  'ssl.gstatic.com',
  'www.gstatic.com',
  'fonts.gstatic.com',
  'maps.gstatic.com',
  'encrypted-tbn0.gstatic.com',
  'encrypted-tbn1.gstatic.com',
  'encrypted-tbn2.gstatic.com',
  'encrypted-tbn3.gstatic.com',
  'fonts.googleapis.com',
  'maps.googleapis.com',
  'lh3.google.com',
  'lh3.googleusercontent.com',
  'lh5.googleusercontent.com',
  'i.ytimg.com',
  'yt3.ggpht.com',
  // Google navigation and embedded services required by the app
  'www.google.com',
  'apis.google.com',
  'ogs.google.com',
  'play.google.com',
  'csp.withgoogle.com',
  'www.youtube.com',
  // Telemetry/experiments requested by the official web client
  'www.googletagmanager.com',
  'static.doubleclick.net',
  'td.doubleclick.net',
  'googleads.g.doubleclick.net',
  'www.google-analytics.com',
]

let _id = 0
function nextId(prefix: string): string {
  return `${prefix}:${++_id}`
}

function rule(type: RuleTargetType, value: string, action: RuleAction, priority: number): RoutingRule {
  return {
    id: nextId(`ai:${type}:${value}`),
    target: { type, value },
    action,
    priority,
    source: { provider: 'scenario:ai-services', category: 'ai' },
  }
}

function buildRules(): readonly RoutingRule[] {
  // Priority 1100-1199: AI overrides general bypass (1500+)
  let p = 1100
  return [
    // MetaCubeX's maintained Gemini category catches service-specific hosts as
    // they evolve; the explicit list below supplies shared Google dependencies.
    rule('geosite', 'google-gemini', 'proxy', p++),
    ...[...AI_DOMAINS, ...GEMINI_REQUIRED_DOMAINS]
      .map(d => rule('domain_suffix', d, 'proxy', p++)),
  ]
}

export function createAIServicesScenario(): RoutingScenario {
  return {
    id: 'ai-services',
    name: 'AI-сервисы',
    description: 'ChatGPT, Claude, Gemini, Copilot, Perplexity через VPN.',
    category: 'ai',
    icon: 'Sparkles',
    defaultEnabled: true,
    composable: true,
    rules: buildRules(),
    defaultAction: null,
  }
}
