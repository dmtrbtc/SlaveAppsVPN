import type { RoutingPolicy } from '../models/RoutingPolicy'
import type { RoutingRule } from '../models/RoutingRule'
import type { ValidationResult, ValidationError, ValidationWarning } from '../models/ValidationResult'

const PRIORITY_BANDS = {
  processRules: { min: 0, max: 999 },
  userRules: { min: 1000, max: 1999 },
  providerRules: { min: 2000, max: 2999 },
  geoRules: { min: 3000, max: 3999 },
} as const

export class PolicyValidator {
  validate(policy: RoutingPolicy): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []

    const allIds = new Set<string>()

    this.validateRuleBand(policy.processRules, 'processRules', PRIORITY_BANDS.processRules, allIds, errors, warnings)
    this.validateRuleBand(policy.userRules, 'userRules', PRIORITY_BANDS.userRules, allIds, errors, warnings)
    this.validateRuleBand(policy.providerRules, 'providerRules', PRIORITY_BANDS.providerRules, allIds, errors, warnings)

    for (const geo of policy.geoRules) {
      if (!geo.id) {
        errors.push({ code: 'MISSING_ID', message: 'GeoRule is missing an id', field: 'geoRules' })
        continue
      }
      if (allIds.has(geo.id)) {
        errors.push({ code: 'DUPLICATE_ID', message: `Duplicate rule id: ${geo.id}`, ruleId: geo.id })
      } else {
        allIds.add(geo.id)
      }
      if (!geo.code || geo.code.trim().length === 0) {
        errors.push({ code: 'EMPTY_VALUE', message: `GeoRule ${geo.id} has empty code`, ruleId: geo.id })
      }
      if (geo.priority < PRIORITY_BANDS.geoRules.min || geo.priority > PRIORITY_BANDS.geoRules.max) {
        warnings.push({
          code: 'PRIORITY_OUT_OF_BAND',
          message: `GeoRule ${geo.id} priority ${geo.priority} is outside recommended band 3000-3999`,
          ruleId: geo.id,
          field: 'priority',
        })
      }
    }

    return { valid: errors.length === 0, errors, warnings }
  }

  private validateRuleBand(
    rules: readonly RoutingRule[],
    bandName: string,
    band: { min: number; max: number },
    allIds: Set<string>,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    for (const rule of rules) {
      if (!rule.id) {
        errors.push({ code: 'MISSING_ID', message: `Rule in ${bandName} is missing an id`, field: bandName })
        continue
      }
      if (allIds.has(rule.id)) {
        errors.push({ code: 'DUPLICATE_ID', message: `Duplicate rule id: ${rule.id}`, ruleId: rule.id })
      } else {
        allIds.add(rule.id)
      }
      if (!rule.target.value || rule.target.value.trim().length === 0) {
        errors.push({ code: 'EMPTY_VALUE', message: `Rule ${rule.id} has empty target value`, ruleId: rule.id, field: 'target.value' })
      }
      if (rule.priority < band.min || rule.priority > band.max) {
        warnings.push({
          code: 'PRIORITY_OUT_OF_BAND',
          message: `Rule ${rule.id} priority ${rule.priority} is outside recommended band ${band.min}-${band.max}`,
          ruleId: rule.id,
          field: 'priority',
        })
      }
    }
  }
}
