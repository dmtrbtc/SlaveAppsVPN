import pino from 'pino'
import { join } from 'path'
import { mkdirSync } from 'fs'

let _logger: pino.Logger | null = null

function createLogger(userDataPath?: string): pino.Logger {
  const isDev = process.env.NODE_ENV === 'development'

  if (isDev || !userDataPath) {
    return pino({
      level: 'debug',
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard' },
      },
    })
  }

  const logDir = join(userDataPath, 'logs')
  mkdirSync(logDir, { recursive: true })

  return pino(
    { level: 'info' },
    pino.destination({
      dest: join(logDir, 'main.log'),
      sync: false,
      mkdir: true,
    })
  )
}

export function initLogger(userDataPath?: string): pino.Logger {
  _logger = createLogger(userDataPath)
  return _logger
}

export function getLogger(): pino.Logger {
  if (!_logger) {
    _logger = createLogger()
  }
  return _logger
}
