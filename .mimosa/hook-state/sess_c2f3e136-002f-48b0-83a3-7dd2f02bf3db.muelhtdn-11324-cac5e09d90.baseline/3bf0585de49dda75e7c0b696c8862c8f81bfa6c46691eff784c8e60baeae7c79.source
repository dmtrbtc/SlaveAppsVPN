import type { SubscriptionService } from '../SubscriptionService'
import type { SubscriptionProvider } from '@slave-vpn/provider'
import type { Subscription, Device } from '@slave-vpn/shared'
import { API } from '@slave-vpn/shared'
import type { SubscriptionRepository } from '@slave-vpn/state-sync'
import { getLogger } from '../../logger'

export class SubscriptionServiceImpl implements SubscriptionService {
  constructor(
    private readonly provider: SubscriptionProvider,
    private readonly repository: SubscriptionRepository
  ) {}

  async get(): Promise<Subscription> {
    const cached = this.repository.get()
    if (cached && !this.repository.isStale()) {
      getLogger().debug('Subscription served from cache')
      return cached
    }
    return this.refresh()
  }

  async refresh(): Promise<Subscription> {
    const subscription = await this.provider.getSubscription()
    this.repository.set(subscription)
    getLogger().debug({ status: subscription.status }, 'Subscription refreshed from API')
    return subscription
  }

  async getDevices(): Promise<Device[]> {
    return this.provider.getDevices()
  }

  async removeDevice(hwid: string): Promise<void> {
    await this.provider.removeDevice(hwid)
  }

  schedulePeriodicRefresh(intervalMs = API.CACHE_TTL_MS.SUBSCRIPTION): NodeJS.Timeout {
    return setInterval(async () => {
      try {
        await this.refresh()
      } catch (err) {
        getLogger().warn({ err }, 'Periodic subscription refresh failed — using cache')
      }
    }, intervalMs)
  }
}
