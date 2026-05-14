import type { Subscription, Device } from '@slave-vpn/shared'
import type { SubscriptionProvider } from '@slave-vpn/provider'
import type { SubscriptionApiService } from '@slave-vpn/api'

export class RemnawaveSubscriptionProvider implements SubscriptionProvider {
  constructor(private readonly subscriptionApi: SubscriptionApiService) {}

  async getSubscription(): Promise<Subscription> {
    return this.subscriptionApi.getSubscription()
  }

  async getDevices(): Promise<Device[]> {
    return this.subscriptionApi.getDevices()
  }

  async removeDevice(hwid: string): Promise<void> {
    await this.subscriptionApi.removeDevice(hwid)
  }

  async getConnectionLink(): Promise<string> {
    return this.subscriptionApi.getConnectionLink()
  }
}
