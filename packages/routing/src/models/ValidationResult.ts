export interface ValidationError {
  readonly code: string
  readonly message: string
  readonly ruleId?: string
  readonly field?: string
}

export interface ValidationWarning {
  readonly code: string
  readonly message: string
  readonly ruleId?: string
  readonly field?: string
}

export interface ValidationResult {
  readonly valid: boolean
  readonly errors: readonly ValidationError[]
  readonly warnings: readonly ValidationWarning[]
}

export function mergeValidationResults(...results: ValidationResult[]): ValidationResult {
  const errors = results.flatMap(r => r.errors)
  const warnings = results.flatMap(r => r.warnings)
  return { valid: errors.length === 0, errors, warnings }
}
