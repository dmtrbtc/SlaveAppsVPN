import pino from 'pino'
import { join } from 'path'
import { mkdirSync, appendFileSync, existsSync, statSync, renameSync, unlinkSync } from 'fs'
import { randomUUID } from 'crypto'

let _logger: pino.Logger | null = null
const SESSION_ID = randomUUID().slice(0, 8)

// Rotate log files if they exceed the size limit (keep last LOG_KEEP files)
const LOG_MAX_BYTES = 5 * 1024 * 1024  // 5 MB
const LOG_KEEP = 3

function rotateLog(logPath: string): void {
  if (!existsSync(logPath)) return
  try {
    if (statSync(logPath).size < LOG_MAX_BYTES) return
  } catch {
    return
  }

  // Shift existing backups down: .3 → deleted, .2 → .3, .1 → .2, main → .1
  for (let i = LOG_KEEP - 1; i >= 1; i--) {
    const src = `${logPath}.${i}`
    const dst = `${logPath}.${i + 1}`
    if (existsSync(dst)) { try { unlinkSync(dst) } catch { /* ignore */ } }
    if (existsSync(src)) { try { renameSync(src, dst) } catch { /* ignore */ } }
  }
  try {
    renameSync(logPath, `${logPath}.1`)
  } catch { /* ignore */ }
}

function createLogger(userDataPath?: string): pino.Logger {
  const isDev = process.env.NODE_ENV === 'development'

  if (isDev || !userDataPath) {
    return pino({
      level: 'debug',
      base: { session: SESSION_ID },
      serializers: { err: pino.stdSerializers.err, error: pino.stdSerializers.err },
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard' },
      },
    })
  }

  const logDir = join(userDataPath, 'logs')
  mkdirSync(logDir, { recursive: true })
  const logPath = join(logDir, 'main.log')

  rotateLog(logPath)

  return pino(
    {
      level: 'info',
      base: { session: SESSION_ID, build: __APP_COMMIT__ ?? 'dev' },
      serializers: { err: pino.stdSerializers.err, error: pino.stdSerializers.err },
    },
    pino.destination({
      dest: logPath,
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

export function getSessionId(): string {
  return SESSION_ID
}

// ─── Crash diagnostics ────────────────────────────────────────────────────────

let _crashLogPath: string | null = null

export function setCrashLogPath(userDataPath: string): void {
  const logDir = join(userDataPath, 'logs')
  mkdirSync(logDir, { recursive: true })
  _crashLogPath = join(logDir, 'crash.log')
}

export function getCrashLogPath(): string | null {
  return _crashLogPath
}

export function writeCrashLog(label: string, error: unknown): void {
  const timestamp = new Date().toISOString()
  const stack = error instanceof Error ? (error.stack ?? error.message) : String(error)

  const entry = [
    `\n${'─'.repeat(72)}`,
    `[${timestamp}] ${label}`,
    `Session:  ${SESSION_ID}`,
    `Build:    ${__APP_COMMIT__ ?? 'dev'}`,
    `Electron: ${process.versions.electron ?? 'unknown'}`,
    `Node:     ${process.versions.node}`,
    `Platform: ${process.platform} ${process.arch}`,
    ``,
    stack,
    `${'─'.repeat(72)}`,
  ].join('\n')

  const target = _crashLogPath ?? join(process.env.TEMP ?? '.', 'slave-vpn-crash.log')
  try {
    appendFileSync(target, entry, 'utf-8')
  } catch {
    process.stderr.write(entry + '\n')
  }
}
