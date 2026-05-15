import type { AxiosInstance, AxiosError, AxiosResponse } from 'axios'
import type { TokenStorage } from '../../storage/TokenStorage'
import type { RefreshLock } from '../RefreshLock'
import type { AuthTokens } from '@slave-vpn/shared'
import { ApiError } from '../../errors/ApiError'

const AUTH_ROUTES_PREFIX = '/cabinet/auth/'

interface RefreshInterceptorOptions {
  axiosInstance: AxiosInstance
  tokenStorage: TokenStorage
  refreshLock: RefreshLock
  onSessionExpired: () => void
}

export function createRefreshResponseInterceptor(options: RefreshInterceptorOptions) {
  const { axiosInstance, tokenStorage, refreshLock, onSessionExpired } = options

  return {
    onFulfilled: (response: AxiosResponse) => response,

    onRejected: async (error: unknown): Promise<AxiosResponse> => {
      if (!isAxiosError(error)) throw error

      const originalRequest = error.config
      const status = error.response?.status

      if (!originalRequest) throw error

      const isAuthRoute = (originalRequest.url ?? '').includes(AUTH_ROUTES_PREFIX)
      const alreadyRetried = (originalRequest as unknown as Record<string, unknown>)['_retry'] === true

      if (status !== 401 || isAuthRoute || alreadyRetried) {
        throw toApiError(error)
      }

      ;(originalRequest as unknown as Record<string, unknown>)['_retry'] = true

      try {
        const refreshedTokens = await refreshLock.execute(async (): Promise<AuthTokens> => {
          const refreshToken = await tokenStorage.getRefreshToken()
          if (!refreshToken) {
            throw ApiError.sessionExpired()
          }

          const response = await axiosInstance.post<{ access_token: string; refresh_token?: string }>(
            '/cabinet/auth/refresh',
            { refresh_token: refreshToken }
          )

          return {
            accessToken: response.data.access_token,
            refreshToken: response.data.refresh_token ?? refreshToken,
            expiresAt: Date.now() + 60 * 60 * 1000,
          }
        })

        await tokenStorage.setTokens(refreshedTokens)
        originalRequest.headers.set('Authorization', `Bearer ${refreshedTokens.accessToken}`)

        return axiosInstance(originalRequest)
      } catch {
        await tokenStorage.clearTokens()
        onSessionExpired()
        throw ApiError.sessionExpired()
      }
    },
  }
}

function isAxiosError(error: unknown): error is AxiosError {
  return typeof error === 'object' && error !== null && (error as AxiosError).isAxiosError === true
}

function toApiError(error: AxiosError): ApiError {
  const status = error.response?.status
  const url = error.config?.url

  if (!error.response) {
    if (error.code === 'ECONNABORTED') {
      return new ApiError('TIMEOUT', 'Request timed out', url !== undefined ? { endpoint: url } : {})
    }
    return new ApiError('NETWORK_ERROR', error.message, url !== undefined ? { endpoint: url } : {})
  }

  return ApiError.fromHttpStatus(status ?? 500, error.message, url ?? undefined)
}
