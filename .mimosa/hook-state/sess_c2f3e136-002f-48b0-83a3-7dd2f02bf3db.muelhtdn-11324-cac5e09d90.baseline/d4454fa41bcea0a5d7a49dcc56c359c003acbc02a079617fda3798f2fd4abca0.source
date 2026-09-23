import type { ConfigSource } from '@slave-vpn/provider'
import { parseProxyLink } from './proxyParser'
import { buildMihomoYaml } from './mihomoYaml'
import type { ProxyEntry } from './mihomoYaml'

export class SingleProxySource implements ConfigSource {
  private readonly yaml: string
  readonly parsedProxy: ProxyEntry

  constructor(proxyLink: string) {
    this.parsedProxy = parseProxyLink(proxyLink)
    this.yaml = buildMihomoYaml([this.parsedProxy])
  }

  async fetchYaml(): Promise<string> {
    return this.yaml
  }
}

export { parseProxyLink } from './proxyParser'
