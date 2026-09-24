// Only fixed lifecycle messages are safe to expose. API response bodies and
// arbitrary errors can contain subscription credentials or server identities.
export function safeLifecycleError(error: unknown): { errorType: string; errorMessage: string } {
  const message = error instanceof Error ? error.message : ''
  const stateError = /^Cannot (?:start engine|update profile) in state: (?:idle|starting|running|stopping|crashed|reconnecting|error)$/
  const fixed = new Set([
    'Mihomo process exit not confirmed after termination',
    'Mihomo API did not become ready within timeout',
    'Connection already in progress',
    'Process already running',
    'Profile update and rollback failed',
    'Profile update and restart recovery failed',
  ])
  const apiStatus = /^Mihomo API error (\d{3}):/.exec(message)
  return {
    errorType: error instanceof Error ? 'Error' : 'Unknown',
    errorMessage: fixed.has(message) || stateError.test(message) ? message
      : apiStatus ? `Mihomo API error ${apiStatus[1]} (response omitted)`
      : 'Runtime operation failed (details omitted for privacy)',
  }
}
