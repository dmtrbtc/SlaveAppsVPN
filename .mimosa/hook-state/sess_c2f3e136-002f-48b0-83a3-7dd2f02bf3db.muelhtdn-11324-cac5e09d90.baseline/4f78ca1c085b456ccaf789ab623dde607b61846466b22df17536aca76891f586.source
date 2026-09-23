import type { RoutingPolicy, NormalizedPolicy } from '../models/RoutingPolicy'
import type { ValidationResult } from '../models/ValidationResult'
import { PolicyNormalizer } from './PolicyNormalizer'
import { PolicyValidator } from './PolicyValidator'
import { PolicyOptimizer } from './PolicyOptimizer'

export interface PipelineResult {
  readonly policy: NormalizedPolicy
  readonly validation: ValidationResult
}

export class RoutingPipeline {
  private readonly normalizer = new PolicyNormalizer()
  private readonly validator = new PolicyValidator()
  private readonly optimizer = new PolicyOptimizer()

  process(policy: RoutingPolicy): PipelineResult {
    const validation = this.validator.validate(policy)
    const normalized = this.normalizer.normalize(policy)
    const optimized = this.optimizer.optimize(normalized)
    return { policy: optimized, validation }
  }

  processStrict(policy: RoutingPolicy): NormalizedPolicy {
    const { policy: result, validation } = this.process(policy)
    if (!validation.valid) {
      const messages = validation.errors.map(e => e.message).join('; ')
      throw new Error(`Routing policy validation failed: ${messages}`)
    }
    return result
  }
}
