import pino from 'pino'
import { join } from 'path'
import { mkdirSync, appendFileSync } from 'fs'

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

// ─── Crash diagnostics ────────────────────────────────────────────────────────
// Called before the logger may be initialized. Writes a crash file directly
// to a temp path so diagnostics survive even if userData is unavailable.

let _crashLogPath: string | null = null

export function setCrashLogPath(userDataPath: string): void {
  const logDir = join(userDataPath, 'logs')
  mkdirSync(logDir, { recursive: true })
  _crashLogPath = join(logDir, 'crash.log')
}

export function writeCrashLog(label: string, error: unknown): void {
  const timestamp = new Date().toISOString()
  const stack = error instanceof Error ? (error.stack ?? error.message) : String(error)

  const entry = [
    `\n${'─'.repeat(72)}`,
    `[${timestamp}] ${label}`,
    `Electron: ${process.versions.electron ?? 'unknown'}`,
    `Node:     ${process.versions.node}`,
    `Platform: ${process.platform} ${process.arch}`,
    ``,
    stack,
    `${'─'.repeat(72)}`,
  ].join('\n')

  // Write to configured path if available, otherwise fall back to temp dir
  const target = _crashLogPath ?? join(process.env.TEMP ?? '.', 'slave-vpn-crash.log')
  try {
    appendFileSync(target, entry, 'utf-8')
  } catch {
    // Last resort — stdout, since file write itself failed
    process.stderr.write(entry + '\n')
  }
}
