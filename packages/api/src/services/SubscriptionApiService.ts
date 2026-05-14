import type { ApiClient } from '../client/ApiClient'
import type {
  ApiSubscription,
  ApiDevice,
  ApiConnectionLink,
} from '../types/subscription.types'
import type { Subscription, Device } from '@slave-vpn/shared'

const BASE = '/cabinet/subscription'

export class SubscriptionApiService {
  constructor(private readonly client: ApiClient) {}

  async getSubscription(subscriptionId?: string): Promise<Subscription> {
    const params = subscriptionId ? { sub_id: subscriptionId } : {}
    const response = await this.client.axios.get<ApiSubscription>(BASE, { params })
    return this.mapSubscription(response.data)
  }

  async refreshTraffic(subscriptionId?: string): Promise<Subscription> {
    const params = subscriptionId ? { sub_id: subscriptionId } : {}
    await this.client.axios.post<void>(`${BASE}/refresh-traffic`, undefined, { params })
    return this.getSubscription(subscriptionId)
  }

  async getDevices(subscriptionId?: string): Promise<Device[]> {
    const params = subscriptionId ? { sub_id: subscriptionId } : {}
    const response = await this.client.axios.get<ApiDevice[]>(`${BASE}/devices`, { params })
    return response.data.map(this.mapDevice)
  }

  async removeDevice(hwid: string, subscriptionId?: string): Promise<void> {
    const params = subscriptionId ? { sub_id: subscriptionId } : {}
    await this.client.axios.delete(`${BASE}/devices/${encodeURIComponent(hwid)}`, { params })
  }

  async removeAllDevices(subscriptionId?: string): Promise<void> {
    const params = subscriptionId ? { sub_id: subscriptionId } : {}
    await this.client.axios.delete(`${BASE}/devices`, { params })
  }

  // SECURITY: this endpoint returns the raw subscription URL.
  // This method must ONLY be called from main process / runtime layer.
  // The URL must NEVER be forwarded to the renderer.
  async getConnectionLink(subscriptionId?: string): Promise<string> {
    const params = subscriptionId ? { sub_id: subscriptionId } : {}
    const response = await this.client.axios.get<ApiConnectionLink>(
      `${BASE}/connection-link`,
      { params }
    )
    return response.data.url
  }

  private mapSubscription(data: ApiSubscription): Subscription {
    return {
      id: data.id,
      status: data.status,
      tariffName: data.tariff_name,
      expiresAt: data.expires_at,
      trafficUsedBytes: data.traffic_used_bytes,
      trafficLimitGb: data.traffic_limit_gb,
      trafficResetMode: data.traffic_reset_mode,
      deviceLimit: data.device_limit,
      devicesOnline: data.devices_online,
      autoRenew: data.auto_renew,
      connectionLink: null,
      createdAt: data.created_at,
    }
  }

  private mapDevice(data: ApiDevice): Device {
    return {
      hwid: data.hwid,
      name: data.name,
      platform: data.platform,
      lastSeenAt: data.last_seen_at,
      isOnline: data.is_online,
    }
  }
}
