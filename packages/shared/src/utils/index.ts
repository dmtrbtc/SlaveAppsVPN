export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function withTimeout<T>(promise: Promise<T>, ms: number, errorMessage?: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(errorMessage ?? `Operation timed out after ${ms}ms`)), ms)
  )
  return Promise.race([promise, timeout])
}

export function isExpired(expiresAt: string | null, bufferMs = 0): boolean {
  if (!expiresAt) return true
  return Date.now() + bufferMs >= new Date(expiresAt).getTime()
}

export function isCacheValid(cachedAt: number, ttlMs: number): boolean {
  return Date.now() - cachedAt < ttlMs
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function retry<T>(
  fn: () => Promise<T>,
  attempts: number,
  delayMs: number,
  backoffMultiplier = 1
): Promise<T> {
  return fn().catch((error: unknown) => {
    if (attempts <= 1) throw error
    return sleep(delayMs).then(() =>
      retry(fn, attempts - 1, delayMs * backoffMultiplier, backoffMultiplier)
    )
  })
}

export function countryCodeToFlag(countryCode: string): string {
  const codePoints = [...countryCode.toUpperCase()].map(
    (char) => 0x1f1e0 + char.charCodeAt(0) - 'A'.charCodeAt(0)
  )
  return String.fromCodePoint(...codePoints)
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}ч ${m}м`
  if (m > 0) return `${m}м ${s}с`
  return `${s}с`
}
