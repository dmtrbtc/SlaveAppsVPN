const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

let sessionCsrfToken: string | null = null

function generateToken(): string {
  const bytes = new Uint8Array(32)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    // Node.js fallback (used in main process / tests)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require('crypto') as { randomFillSync(buf: Uint8Array): Uint8Array }
    nodeCrypto.randomFillSync(bytes)
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function getCsrfToken(): string {
  if (!sessionCsrfToken) {
    sessionCsrfToken = generateToken()
  }
  return sessionCsrfToken
}

export function isMutationMethod(method: string | undefined): boolean {
  return MUTATION_METHODS.has((method ?? '').toUpperCase())
}
