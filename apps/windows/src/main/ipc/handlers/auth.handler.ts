import { IpcChannel } from '../../../shared/ipc/channels'
import {
  LoginEmailSchema,
  LoginTelegramSchema,
  EmptySchema,
} from '../../../shared/ipc/schemas'
import { errResult, okResult } from '../../../shared/ipc/types'
import { handleIpc, services } from '../registry'
import { getSecureStorage } from '../../security/SecureStorage'
import type { AuthService } from '../../services/AuthService'

export function registerAuthHandlers(): void {
  handleIpc(IpcChannel.AUTH_LOGIN_EMAIL, LoginEmailSchema, async (data) => {
    if (!services.has('auth')) {
      return errResult('NOT_INITIALIZED', 'Auth service not yet initialized')
    }
    const auth = services.resolve<AuthService>('auth')
    const tokens = await auth.loginEmail(data.email, data.password)
    getSecureStorage().storeTokens(tokens)
    return okResult(tokens)
  })

  handleIpc(IpcChannel.AUTH_LOGIN_TELEGRAM, LoginTelegramSchema, async (data) => {
    if (!services.has('auth')) {
      return errResult('NOT_INITIALIZED', 'Auth service not yet initialized')
    }
    const auth = services.resolve<AuthService>('auth')
    const tokens = await auth.loginTelegram(data.initData)
    getSecureStorage().storeTokens(tokens)
    return okResult(tokens)
  })

  handleIpc(IpcChannel.AUTH_LOGOUT, EmptySchema, async () => {
    if (services.has('auth')) {
      const auth = services.resolve<AuthService>('auth')
      await auth.logout()
    }
    getSecureStorage().clearTokens()
    return okResult(undefined)
  })

  handleIpc(IpcChannel.AUTH_ME, EmptySchema, async () => {
    if (!services.has('auth')) {
      return errResult('NOT_INITIALIZED', 'Auth service not yet initialized')
    }
    const auth = services.resolve<AuthService>('auth')
    const user = await auth.getMe()
    return okResult(user)
  })

  handleIpc(IpcChannel.AUTH_REFRESH, EmptySchema, async () => {
    if (!services.has('auth')) {
      return errResult('NOT_INITIALIZED', 'Auth service not yet initialized')
    }
    const auth = services.resolve<AuthService>('auth')
    const tokens = await auth.refresh()
    getSecureStorage().storeTokens(tokens)
    return okResult(tokens)
  })
}
