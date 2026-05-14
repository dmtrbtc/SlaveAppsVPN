import type { Subscription, Device } from '@slave-vpn/shared'

export interface SubscriptionProvider {
  getSubscription(): Promise<Subscription>
  getDevices(): Promise<Device[]>
  removeDevice(hwid: string): Promise<void>
  // SECURITY: returns raw subscription URL — must NEVER be forwarded to renderer
  getConnectionLink(): Promise<string>
}
