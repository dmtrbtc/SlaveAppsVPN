import { AppError } from '@slave-vpn/shared'

export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'PARSE_ERROR'
  | 'REFRESH_FAILED'
  | 'SESSION_EXPIRED'

export class ApiError extends AppError {
  readonly apiCode: ApiErrorCode
  readonly httpStatus?: number
  readonly endpoint?: string

  constructor(
    code: ApiErrorCode,
    message: string,
    options?: { httpStatus?: number; endpoint?: string; cause?: Error; details?: unknown }
  ) {
    super('API_ERROR', message, {
      ...(options?.cause !== undefined ? { cause: options.cause } : {}),
      ...(options?.details !== undefined ? { details: options.details } : {}),
    })
    this.name = 'ApiError'
    this.apiCode = code
    if (options?.httpStatus !== undefined) this.httpStatus = options.httpStatus
    if (options?.endpoint !== undefined) this.endpoint = options.endpoint
  }

  get isUnauthorized(): boolean {
    return this.apiCode === 'UNAUTHORIZED' || this.apiCode === 'SESSION_EXPIRED'
  }

  get isNetworkFailure(): boolean {
    return this.apiCode === 'NETWORK_ERROR' || this.apiCode === 'TIMEOUT'
  }

  static unauthorized(endpoint?: string): ApiError {
    return new ApiError('UNAUTHORIZED', 'Authentication required', {
      httpStatus: 401,
      ...(endpoint !== undefined ? { endpoint } : {}),
    })
  }

  static sessionExpired(): ApiError {
    return new ApiError('SESSION_EXPIRED', 'Session expired — please log in again', {
      httpStatus: 401,
    })
  }

  static fromHttpStatus(status: number, message: string, endpoint?: string): ApiError {
    const code: ApiErrorCode =
      status === 401 ? 'UNAUTHORIZED'
      : status === 403 ? 'FORBIDDEN'
      : status === 404 ? 'NOT_FOUND'
      : status === 429 ? 'RATE_LIMITED'
      : 'SERVER_ERROR'

    return new ApiError(code, message, {
      httpStatus: status,
      ...(endpoint !== undefined ? { endpoint } : {}),
    })
  }
}
