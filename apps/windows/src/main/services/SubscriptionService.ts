import type { Subscription, Device } from '@slave-vpn/shared'

export interface SubscriptionService {
  get(): Promise<Subscription>
  refresh(): Promise<Subscription>
  getDevices(): Promise<Device[]>
  removeDevice(hwid: string): Promise<void>
}
