import { type IpcMainInvokeEvent } from 'electron'
import { type ZodSchema, type ZodError } from 'zod'
import { errResult, type IpcResult } from '../../shared/ipc/types'
import { getLogger } from '../logger'

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
  handler: Handler<TInput, TOutput>
): ValidatedHandler<TOutput> {
  return async (event: IpcMainInvokeEvent, rawData: unknown): Promise<IpcResult<TOutput>> => {
    if (!isValidIpcOrigin(event)) {
      getLogger().warn('IPC call from unexpected origin blocked')
      return errResult('FORBIDDEN', 'Invalid IPC origin')
    }

    const parseResult = schema.safeParse(rawData)

    if (!parseResult.success) {
      const formatted = formatZodError(parseResult.error)
      getLogger().warn({ errors: formatted }, 'IPC payload validation failed')
      return errResult('VALIDATION_ERROR', `Invalid payload: ${formatted}`)
    }

    try {
      return await handler(parseResult.data, event)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      getLogger().error({ error }, 'IPC handler threw an exception')
      return errResult('HANDLER_ERROR', message)
    }
  }
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
