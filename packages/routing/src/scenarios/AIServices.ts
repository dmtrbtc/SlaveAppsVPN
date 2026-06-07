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
  return AI_DOMAINS.map(d => rule('domain_suffix', d, 'proxy', p++))
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
