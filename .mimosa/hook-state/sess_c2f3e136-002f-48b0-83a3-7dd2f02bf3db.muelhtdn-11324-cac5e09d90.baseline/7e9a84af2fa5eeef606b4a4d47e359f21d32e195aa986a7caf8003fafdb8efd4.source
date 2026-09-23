import type { RuleCompiler, CompiledOutput } from './RuleCompiler'
import type { NormalizedPolicy } from '../models/RoutingPolicy'
import type { RoutingRule, RuleAction, RuleTargetType } from '../models/RoutingRule'

export interface MihomoCompilerOptions {
  proxyGroupName: string
}

export class MihomoRuleCompiler implements RuleCompiler<MihomoCompilerOptions> {
  readonly compilerType = 'mihomo'

  compile(policy: NormalizedPolicy, options: MihomoCompilerOptions): CompiledOutput {
    const rules: string[] = policy.rules.map(rule => this.compileRule(rule, options.proxyGroupName))
    const defaultTarget = this.actionToTarget(policy.defaultAction, options.proxyGroupName)
    rules.push(`MATCH,${defaultTarget}`)

    return {
      rules,
      defaultTarget,
      metadata: {
        ruleCount: rules.length,
        compiler: this.compilerType,
        compiledAt: new Date(),
      },
    }
  }

  private compileRule(rule: RoutingRule, proxyGroup: string): string {
    const target = this.actionToTarget(rule.action, proxyGroup)
    const noResolve = rule.noResolve ? ',no-resolve' : ''
    const type: RuleTargetType = rule.target.type

    switch (type) {
      case 'domain':         return `DOMAIN,${rule.target.value},${target}`
      case 'domain_suffix':  return `DOMAIN-SUFFIX,${rule.target.value},${target}`
      case 'domain_keyword': return `DOMAIN-KEYWORD,${rule.target.value},${target}`
      case 'ip_cidr':        return `IP-CIDR,${rule.target.value},${target}${noResolve}`
      case 'geoip':          return `GEOIP,${rule.target.value},${target}${noResolve}`
      case 'geosite':        return `GEOSITE,${rule.target.value},${target}`
      case 'process_name':   return `PROCESS-NAME,${rule.target.value},${target}`
      case 'port':           return `DST-PORT,${rule.target.value},${target}`
      default: {
        const exhaustive: never = type
        throw new Error(`Unknown rule target type: ${String(exhaustive)}`)
      }
    }
  }

  private actionToTarget(action: RuleAction, proxyGroup: string): string {
    switch (action) {
      case 'proxy': return proxyGroup
      case 'direct': return 'DIRECT'
      case 'reject': return 'REJECT'
    }
  }
}
