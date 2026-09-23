import * as fs from 'fs'
import * as path from 'path'
import type { RuleProvider, RuleProviderMetadata } from './RuleProvider'
import type { RoutingRule } from '../models/RoutingRule'

interface CacheFile {
  version: string
  checksum: string
  updatedAt: string
  rules: RoutingRule[]
}

export class CacheRuleProvider implements RuleProvider {
  private _metadata: RuleProviderMetadata

  constructor(
    id: string,
    name: string,
    private readonly cachePath: string
  ) {
    this._metadata = {
      id,
      name,
      type: 'cache',
      ruleCount: 0,
    }
  }

  get metadata(): RuleProviderMetadata {
    return this._metadata
  }

  async load(): Promise<readonly RoutingRule[]> {
    const raw = fs.readFileSync(this.cachePath, 'utf-8')
    const data: CacheFile = JSON.parse(raw)
    this._metadata = {
      ...this._metadata,
      version: data.version,
      checksum: data.checksum,
      updatedAt: new Date(data.updatedAt),
      ruleCount: data.rules.length,
    }
    return data.rules
  }

  isAvailable(): boolean {
    return fs.existsSync(this.cachePath)
  }

  async save(rules: readonly RoutingRule[], version: string, checksum: string): Promise<void> {
    const dir = path.dirname(this.cachePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    const data: CacheFile = {
      version,
      checksum,
      updatedAt: new Date().toISOString(),
      rules: rules as RoutingRule[],
    }
    const tmpPath = `${this.cachePath}.tmp`
    fs.writeFileSync(tmpPath, JSON.stringify(data), 'utf-8')
    fs.renameSync(tmpPath, this.cachePath)
    this._metadata = {
      ...this._metadata,
      version,
      checksum,
      updatedAt: new Date(),
      ruleCount: rules.length,
    }
  }
}
