import https from 'https'
import http from 'http'
import type { ConfigSource } from '@slave-vpn/provider'
import type { SubscriptionProvider } from '@slave-vpn/provider'

export class RemnawaveConfigSource implements ConfigSource {
  constructor(private readonly subscription: SubscriptionProvider) {}

  async fetchYaml(): Promise<string> {
    const url = await this.subscription.getConnectionLink()
    return fetchUrl(url)
  }
}

function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    const req = client.get(url, { timeout: 15_000 }, (res) => {
      if ((res.statusCode ?? 0) >= 400) {
        reject(new Error(`Subscription fetch failed: HTTP ${res.statusCode ?? 0}`))
        res.resume()
        return
      }
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Subscription YAML fetch timed out'))
    })
  })
}
