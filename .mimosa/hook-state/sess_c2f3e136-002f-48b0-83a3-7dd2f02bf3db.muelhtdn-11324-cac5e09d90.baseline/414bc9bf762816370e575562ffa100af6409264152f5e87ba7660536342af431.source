import axios, { type AxiosInstance } from 'axios'
import type { TokenStorage } from '../storage/TokenStorage'
import { RefreshLock } from './RefreshLock'
import { createAuthRequestInterceptor } from './interceptors/auth.interceptor'
import { createRefreshResponseInterceptor } from './interceptors/refresh.interceptor'
import { API } from '@slave-vpn/shared'

export interface ApiClientConfig {
  baseUrl: string
  tokenStorage: TokenStorage
  onSessionExpired: () => void
  timeoutMs?: number
}

export interface ApiClient {
  readonly axios: AxiosInstance
  readonly baseUrl: string
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  const { baseUrl, tokenStorage, onSessionExpired, timeoutMs = API.TIMEOUT_MS } = config

  const instance = axios.create({
    baseURL: baseUrl,
    timeout: timeoutMs,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    withCredentials: false,
  })

  const refreshLock = new RefreshLock()

  instance.interceptors.request.use(
    createAuthRequestInterceptor(tokenStorage),
    (error: unknown) => Promise.reject(error)
  )

  const { onFulfilled, onRejected } = createRefreshResponseInterceptor({
    axiosInstance: instance,
    tokenStorage,
    refreshLock,
    onSessionExpired,
  })

  instance.interceptors.response.use(onFulfilled, onRejected)

  return { axios: instance, baseUrl }
}
