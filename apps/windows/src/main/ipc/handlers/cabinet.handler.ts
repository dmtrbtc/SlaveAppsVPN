import { IpcChannel } from '../../../shared/ipc/channels'
import {
  CabinetLoginEmailSchema, CabinetPollSchema, EmptySchema,
  CabinetRemoveDeviceSchema, CabinetRenewSchema, CabinetAutopaySchema,
} from '../../../shared/ipc/schemas'
import { errResult, okResult, type IpcResult } from '../../../shared/ipc/types'
import type {
  CabinetUserInfo,
  CabinetSubscriptionStatusInfo,
  CabinetPollOutcome,
} from '../../../shared/ipc/types'
import { handleIpc } from '../registry'
import { getCabinetService, CabinetError } from '../../services/CabinetService'
import type { CabinetUser, CabinetSubscription } from '@slave-vpn/core'

function toUserInfo(u: CabinetUser): CabinetUserInfo {
  return {
    id: u.id,
    telegramId: u.telegramId,
    username: u.username,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    emailVerified: u.emailVerified,
    balanceKopeks: u.balanceKopeks,
    balanceRubles: u.balanceRubles,
    referralCode: u.referralCode,
    language: u.language,
    createdAt: u.createdAt,
    authType: u.authType,
  }
}

// SECURITY: deliberately omits subscriptionUrl — the raw URL must never reach
// the renderer.
function toSubInfo(s: CabinetSubscription): CabinetSubscriptionStatusInfo['subscription'] {
  return {
    id: s.id,
    status: s.status,
    isTrial: s.isTrial,
    startDate: s.startDate,
    endDate: s.endDate,
    daysLeft: s.daysLeft,
    hoursLeft: s.hoursLeft,
    minutesLeft: s.minutesLeft,
    timeLeftDisplay: s.timeLeftDisplay,
    trafficLimitGb: s.trafficLimitGb,
    trafficUsedGb: s.trafficUsedGb,
    trafficUsedPercent: s.trafficUsedPercent,
    deviceLimit: s.deviceLimit,
    autopayEnabled: s.autopayEnabled,
    isActive: s.isActive,
    isExpired: s.isExpired,
    isLimited: s.isLimited,
    tariffName: s.tariffName,
  }
}

/** Map a thrown error to an IpcErr, preserving CabinetError codes. */
function toErr(e: unknown): IpcResult<never> {
  if (e instanceof CabinetError) return errResult(e.code, e.message)
  return errResult('CABINET_ERROR', e instanceof Error ? e.message : String(e))
}

export function registerCabinetHandlers(): void {
  const svc = () => getCabinetService()

  handleIpc(IpcChannel.CABINET_AUTH_STATE, EmptySchema, async () => {
    try {
      const authenticated = await svc().getClient().isAuthenticated()
      return okResult({ authenticated })
    } catch (e) { return toErr(e) }
  })

  handleIpc(IpcChannel.CABINET_REQUEST_DEEPLINK, EmptySchema, async () => {
    try {
      return okResult(await svc().getClient().requestDeepLink())
    } catch (e) { return toErr(e) }
  })

  handleIpc(IpcChannel.CABINET_POLL_DEEPLINK, CabinetPollSchema, async (data): Promise<IpcResult<CabinetPollOutcome>> => {
    try {
      const r = await svc().getClient().pollDeepLink(data.token)
      const outcome: CabinetPollOutcome = r.status === 'confirmed'
        ? { status: 'confirmed', user: toUserInfo(r.user) }
        : r
      return okResult(outcome)
    } catch (e) { return toErr(e) }
  })

  handleIpc(IpcChannel.CABINET_LOGIN_EMAIL, CabinetLoginEmailSchema, async (data) => {
    try {
      const user = await svc().getClient().loginEmail(data.email, data.password)
      return okResult(toUserInfo(user))
    } catch (e) { return toErr(e) }
  })

  handleIpc(IpcChannel.CABINET_GET_ME, EmptySchema, async () => {
    try {
      return okResult(toUserInfo(await svc().getClient().getMe()))
    } catch (e) { return toErr(e) }
  })

  handleIpc(IpcChannel.CABINET_GET_SUBSCRIPTION, EmptySchema, async () => {
    try {
      const status = await svc().getClient().getSubscriptionStatus()
      return okResult({
        hasSubscription: status.hasSubscription,
        subscription: status.subscription ? toSubInfo(status.subscription) : null,
      })
    } catch (e) { return toErr(e) }
  })

  handleIpc(IpcChannel.CABINET_IMPORT_SUBSCRIPTION, EmptySchema, async () => {
    try {
      return okResult(await svc().importSubscription())
    } catch (e) { return toErr(e) }
  })

  // Account extras — core types are already renderer-safe (no subscription URL).
  handleIpc(IpcChannel.CABINET_GET_BALANCE, EmptySchema, async () => {
    try { return okResult(await svc().getClient().getBalance()) } catch (e) { return toErr(e) }
  })

  handleIpc(IpcChannel.CABINET_GET_TRANSACTIONS, EmptySchema, async () => {
    try { return okResult(await svc().getClient().getTransactions()) } catch (e) { return toErr(e) }
  })

  handleIpc(IpcChannel.CABINET_GET_DEVICES, EmptySchema, async () => {
    try { return okResult(await svc().getClient().getDevices()) } catch (e) { return toErr(e) }
  })

  handleIpc(IpcChannel.CABINET_REMOVE_DEVICE, CabinetRemoveDeviceSchema, async (data) => {
    try {
      await svc().getClient().removeDevice(data.hwid)
      return okResult(undefined)
    } catch (e) { return toErr(e) }
  })

  handleIpc(IpcChannel.CABINET_GET_RENEWAL_OPTIONS, EmptySchema, async () => {
    try { return okResult(await svc().getClient().getRenewalOptions()) } catch (e) { return toErr(e) }
  })

  handleIpc(IpcChannel.CABINET_RENEW, CabinetRenewSchema, async (data) => {
    try {
      await svc().getClient().renewSubscription(data.periodDays)
      return okResult(undefined)
    } catch (e) { return toErr(e) }
  })

  handleIpc(IpcChannel.CABINET_SET_AUTOPAY, CabinetAutopaySchema, async (data) => {
    try {
      await svc().getClient().setAutopay(data.enabled, data.daysBefore)
      return okResult(undefined)
    } catch (e) { return toErr(e) }
  })

  handleIpc(IpcChannel.CABINET_LOGOUT, EmptySchema, async () => {
    try {
      await svc().getClient().logout()
      return okResult(undefined)
    } catch (e) { return toErr(e) }
  })
}
