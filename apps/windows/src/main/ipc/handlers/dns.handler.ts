import { IpcChannel } from '../../../shared/ipc/channels'
import { z } from 'zod'
import { okResult, errResult } from '../../../shared/ipc/types'
import { handleIpc } from '../registry'
import { getSettingsStore } from '../../services/SettingsStore'
import { buildDnsProfileConfig, getPresets, getStrategies } from '../../services/DnsProfileService'
import { runDnsLeakTest } from '../../services/DnsLeakTest'
import { EmptySchema } from '../../../shared/ipc/schemas'
const ResolverKindSchema = z.enum(['doh', 'dot', 'udp', 'tcp', 'doq'])
const RuleMatchSchema = z.enum(['domain', 'domain_suffix', 'domain_keyword', 'geosite'])

const CustomResolverSchema = z.object({
  id: z.string(),
  type: ResolverKindSchema,
  url: z.string().max(512),
  preferH3: z.boolean().optional(),
})

const CustomRuleSchema = z.object({
  id: z.string(),
  matchType: RuleMatchSchema,
  value: z.string().max(256),
  resolverTag: z.string().max(512),
})

const DnsSetProfileSchema = z.object({
  profile: z.object({
    preset: z.enum(['secure', 'balanced', 'performance', 'minimal', 'custom']),
    primaryDoh: z.string(),
    fallbackDns: z.array(z.string()),
    fakeIpEnabled: z.boolean(),
    ipv6Enabled: z.boolean(),
    bootstrapDns: z.array(z.string()),
    strategy: z.enum(['prefer_ipv4', 'ipv4_only', 'prefer_ipv6', 'ipv6_only']).optional(),
    customResolvers: z.array(CustomResolverSchema).optional(),
    customRules: z.array(CustomRuleSchema).optional(),
    prefetchDomains: z.array(z.string()).optional(),
    customNameservers: z.array(z.string()).optional(),
  }),
})

export function registerDnsHandlers(): void {
  handleIpc(IpcChannel.DNS_GET_PROFILE, EmptySchema, async () => {
    const settings = getSettingsStore()
    const preset = settings.get('dnsPreset') ?? 'secure'
    const custom = settings.get('customDnsProfile') ?? null
    const profile = buildDnsProfileConfig(preset as any, custom as any)
    return okResult(profile)
  })

  handleIpc(IpcChannel.DNS_SET_PROFILE, DnsSetProfileSchema, async ({ profile }) => {
    try {
      const settings = getSettingsStore()
      settings.patch({ dnsPreset: profile.preset as any })
      // Persist custom DNS profile (with G.1-G.4 fields) for ALL presets — not
      // only 'custom'. This lets users layer custom resolvers/rules/prefetch on
      // top of preset baselines.
      settings.patch({ customDnsProfile: profile as any })
      return okResult(undefined)
    } catch (err) {
      return errResult('DNS_ERROR', err instanceof Error ? err.message : String(err))
    }
  })

  handleIpc(IpcChannel.DNS_GET_PRESETS, EmptySchema, async () => {
    return okResult(getPresets())
  })

  handleIpc(IpcChannel.DNS_GET_STRATEGIES, EmptySchema, async () => {
    return okResult(getStrategies())
  })

  handleIpc(IpcChannel.DNS_LEAK_TEST, EmptySchema, async () => {
    try {
      const result = await runDnsLeakTest()
      return okResult(result)
    } catch (err) {
      return errResult('DNS_LEAK_ERROR', err instanceof Error ? err.message : String(err))
    }
  })
}
