import type { InternalAxiosRequestConfig } from 'axios'
import type { TokenStorage } from '../../storage/TokenStorage'
import { getCsrfToken, isMutationMethod } from '../CsrfToken'

const AUTH_ROUTES_PREFIX = '/cabinet/auth/'

export function createAuthRequestInterceptor(tokenStorage: TokenStorage) {
  return async (config: InternalAxiosRequestConfig): Promise<InternalAxiosRequestConfig> => {
    const url = config.url ?? ''
    const isAuthRoute = url.includes(AUTH_ROUTES_PREFIX)

    if (!isAuthRoute) {
      const token = await tokenStorage.getAccessToken()
      if (token) {
        config.headers.set('Authorization', `Bearer ${token}`)
      }
    }

    if (isMutationMethod(config.method)) {
      config.headers.set('X-CSRF-Token', getCsrfToken())
    }

    return config
  }
}
