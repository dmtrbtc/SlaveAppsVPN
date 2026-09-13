import { type IpcMainInvokeEvent } from 'electron'
import { type ZodSchema, type ZodError } from 'zod'
import { errResult, type IpcResult } from '../../shared/ipc/types'
import { getLogger } from '../logger'
import { randomUUID } from 'crypto'

type Handler<TInput, TOutput> = (
  data: TInput,
  event: IpcMainInvokeEvent
) => Promise<IpcResult<TOutput>>

type ValidatedHandler<TOutput> = (
  event: IpcMainInvokeEvent,
  rawData: unknown
) => Promise<IpcResult<TOutput>>

export function validated<TInput, TOutput>(
  schema: ZodSchema<TInput>,
  handler: Handler<TInput, TOutput>,
  channel = 'unknown',
): ValidatedHandler<TOutput> {
  return async (event: IpcMainInvokeEvent, rawData: unknown): Promise<IpcResult<TOutput>> => {
    const metadata = {
      channel,
      requestId: randomUUID(),
      operation: channel,
      payloadType: rawData === null ? 'null' : Array.isArray(rawData) ? 'array' : typeof rawData,
    }
    if (!isValidIpcOrigin(event)) {
      getLogger().warn('IPC call from unexpected origin blocked')
      return errResult('FORBIDDEN', 'Invalid IPC origin')
    }

    const parseResult = schema.safeParse(rawData)

    if (!parseResult.success) {
      const formatted = formatZodError(parseResult.error)
      // Codes identify the failed constraint without serializing user input or
      // custom schema messages, which can embed credentials.
      const reasons = parseResult.error.issues.map(issue => issue.code)
      getLogger().warn({ ...metadata, reasons },
        `IPC payload validation failed: channel=${channel}, payloadType=${metadata.payloadType}, reasons=${reasons.join(',')}, requestId=${metadata.requestId}`)
      return errResult('VALIDATION_ERROR', `Invalid payload: ${formatted}`)
    }

    try {
      return await handler(parseResult.data, event)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      const safeError = classifyIpcHandlerError(error)
      getLogger().error({ ...metadata, ...safeError },
        `IPC handler threw an exception: channel=${channel}, errorType=${safeError.errorType}, errorMessage=${safeError.errorMessage}, requestId=${metadata.requestId}`)
      return errResult('HANDLER_ERROR', message)
    }
  }
}

function classifyIpcHandlerError(error: unknown): { errorType: string; errorMessage: string; errorCode?: string } {
  const errorType = error instanceof Error && error.name ? error.name : 'Unknown'
  const candidateCode = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : ''
  const errorCode = /^[A-Z][A-Z0-9_]{1,40}$/.test(candidateCode) ? candidateCode : undefined
  const rawMessage = error instanceof Error ? error.message : ''
  let errorMessage = 'Handler operation failed (details omitted for privacy)'
  if (errorType === 'TypeError') errorMessage = 'Unexpected handler data or state'
  else if (errorType === 'AbortError' || /\b(?:aborted|cancell?ed)\b/i.test(rawMessage)) errorMessage = 'Operation canceled'
  else if (/^No enabled subscriptions$/.test(rawMessage)) errorMessage = rawMessage
  else if (/^Subscription not found$/.test(rawMessage)) errorMessage = rawMessage
  return { errorType, errorMessage, ...(errorCode ? { errorCode } : {}) }
}

function isValidIpcOrigin(event: IpcMainInvokeEvent): boolean {
  const frame = event.senderFrame
  if (!frame) return false

  const url = frame.url

  if (url.startsWith('file://')) return true
  if (url.startsWith('http://localhost:')) return process.env.NODE_ENV === 'development'

  return false
}

function formatZodError(error: ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', ')
}
