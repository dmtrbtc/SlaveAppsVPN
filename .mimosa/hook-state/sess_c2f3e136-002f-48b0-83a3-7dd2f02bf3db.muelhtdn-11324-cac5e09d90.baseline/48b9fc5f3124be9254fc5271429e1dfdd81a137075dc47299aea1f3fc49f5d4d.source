import type { DnsProfile } from '../profiles/DnsProfile'
import type { DnsCompiler, CompiledDnsOutput } from '../compiler/DnsCompiler'
import type { DnsValidationResult } from './DnsValidator'
import { DnsValidator } from './DnsValidator'
import { DnsProfilePresets } from '../profiles/DnsProfilePresets'

export class DnsManager {
  private readonly validator = new DnsValidator()
  private _currentProfile: DnsProfile

  constructor(
    private readonly compiler: DnsCompiler,
    initialProfile?: DnsProfile
  ) {
    this._currentProfile = initialProfile ?? DnsProfilePresets.secure()
  }

  setProfile(profile: DnsProfile): DnsValidationResult {
    const result = this.validator.validate(profile)
    if (result.valid) {
      this._currentProfile = profile
    }
    return result
  }

  setProfileStrict(profile: DnsProfile): void {
    const result = this.validator.validate(profile)
    if (!result.valid) {
      const messages = result.errors.map(e => e.message).join('; ')
      throw new Error(`DNS profile validation failed: ${messages}`)
    }
    this._currentProfile = profile
  }

  getProfile(): DnsProfile {
    return this._currentProfile
  }

  compile(): CompiledDnsOutput {
    return this.compiler.compile(this._currentProfile)
  }

  validate(profile?: DnsProfile): DnsValidationResult {
    return this.validator.validate(profile ?? this._currentProfile)
  }

  applyPreset(preset: 'secure' | 'balanced' | 'minimal'): void {
    this._currentProfile = DnsProfilePresets[preset]()
  }
}
