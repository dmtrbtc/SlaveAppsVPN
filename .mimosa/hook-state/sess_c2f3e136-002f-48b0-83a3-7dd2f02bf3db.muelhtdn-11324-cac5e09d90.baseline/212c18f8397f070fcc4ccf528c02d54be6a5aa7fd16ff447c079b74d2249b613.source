import * as https from 'https'
import * as crypto from 'crypto'
import type { RuleProvider, RuleProviderMetadata } from './RuleProvider'
import type { CacheRuleProvider } from './CacheRuleProvider'
import type { RoutingRule } from '../models/RoutingRule'

export interface RemoteRuleProviderConfig {
  id: string
  name: string
  url: string
  expectedChecksum?: string
  cache: CacheRuleProvider
  timeoutMs?: number
}

interface RemoteRuleFile {
  version: string
  checksum: string
  rules: RoutingRule[]
}

export class RemoteRuleProvider implements RuleProvider {
  private _metadata: RuleProviderMetadata
  private readonly timeoutMs: number

  constructor(private readonly config: RemoteRuleProviderConfig) {
    this._metadata = {
      id: config.id,
      name: config.name,
      type: 'remote',
      ruleCount: 0,
    }
    this.timeoutMs = config.timeoutMs ?? 10_000
  }

  get metadata(): RuleProviderMetadata {
    return this._metadata
  }

  async load(): Promise<readonly RoutingRule[]> {
    try {
      const rules = await this.fetchAndVerify()
      return rules
    } catch (err) {
      if (this.config.cache.isAvailable()) {
        return this.config.cache.load()
      }
      throw new Error(`RemoteRuleProvider ${this.config.id} failed and no cache available: ${String(err)}`)
    }
  }

  isAvailable(): boolean {
    return true
  }

  private async fetchAndVerify(): Promise<readonly RoutingRule[]> {
    const body = await this.fetchUrl(this.config.url)
    const data: RemoteRuleFile = JSON.parse(body)

    const actualChecksum = crypto.createHash('sha256').update(body).digest('hex')
    const expectedChecksum = this.config.expectedChecksum ?? data.checksum

    if (actualChecksum !== expectedChecksum) {
      throw new Error(
        `Checksum mismatch for ${this.config.id}: expected ${expectedChecksum}, got ${actualChecksum}`
      )
    }

    await this.config.cache.save(data.rules, data.version, actualChecksum)

    this._metadata = {
      ...this._metadata,
      version: data.version,
      checksum: actualChecksum,
      updatedAt: new Date(),
      ruleCount: data.rules.length,
    }

    return data.rules
  }

  private fetchUrl(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Request timeout for ${url}`)), this.timeoutMs)
      https
        .get(url, { timeout: this.timeoutMs }, res => {
          if (res.statusCode !== 200) {
            clearTimeout(timer)
            reject(new Error(`HTTP ${res.statusCode} for ${url}`))
            res.resume()
            return
          }
          const chunks: Buffer[] = []
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('end', () => {
            clearTimeout(timer)
            resolve(Buffer.concat(chunks).toString('utf-8'))
          })
          res.on('error', err => { clearTimeout(timer); reject(err) })
        })
        .on('error', err => { clearTimeout(timer); reject(err) })
    })
  }
}
