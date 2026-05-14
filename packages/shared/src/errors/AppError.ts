export type AppErrorCode =
  | 'AUTH_FAILED'
  | 'AUTH_TOKEN_EXPIRED'
  | 'AUTH_TOKEN_INVALID'
  | 'AUTH_REQUIRED'
  | 'NETWORK_ERROR'
  | 'NETWORK_TIMEOUT'
  | 'API_ERROR'
  | 'API_RATE_LIMITED'
  | 'SUBSCRIPTION_EXPIRED'
  | 'SUBSCRIPTION_NOT_FOUND'
  | 'VPN_ENGINE_ERROR'
  | 'CONFIG_GENERATION_FAILED'
  | 'CONFIG_VALIDATION_FAILED'
  | 'STORAGE_ERROR'
  | 'UNKNOWN_ERROR'

export class AppError extends Error {
  readonly code: AppErrorCode
  readonly statusCode?: number
  readonly details?: unknown

  constructor(
    code: AppErrorCode,
    message: string,
    options?: { statusCode?: number; details?: unknown; cause?: Error }
  ) {
    super(message, { cause: options?.cause })
    this.name = 'AppError'
    this.code = code
    this.statusCode = options?.statusCode
    this.details = options?.details
  }

  static isAppError(error: unknown): error is AppError {
    return error instanceof AppError
  }

  static fromUnknown(error: unknown): AppError {
    if (AppError.isAppError(error)) return error
    if (error instanceof Error) {
      return new AppError('UNKNOWN_ERROR', error.message, { cause: error })
    }
    return new AppError('UNKNOWN_ERROR', String(error))
  }
}

export class AuthError extends AppError {
  constructor(message: string, options?: { statusCode?: number; details?: unknown }) {
    super('AUTH_FAILED', message, options)
    this.name = 'AuthError'
  }
}

export class NetworkError extends AppError {
  constructor(message: string, options?: { statusCode?: number; details?: unknown }) {
    super('NETWORK_ERROR', message, options)
    this.name = 'NetworkError'
  }
}

export class VPNEngineError extends AppError {
  constructor(message: string, options?: { details?: unknown; cause?: Error }) {
    super('VPN_ENGINE_ERROR', message, options)
    this.name = 'VPNEngineError'
  }
}
