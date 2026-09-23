export const MIHOMO_LATENCY_TEST_URL = 'https://www.gstatic.com/generate_204'
export const MIHOMO_LATENCY_TIMEOUT_MS = 5_000

export interface NativeDelayResult {
  delay: number
}

export type NativeDelayProbe = (options: {
  name: string
  url: string
  timeout: number
}) => Promise<NativeDelayResult>

/**
 * Measures a node through mihomo itself. Unlike a raw HTTPS request to the
 * server port, URLTest performs the real proxy handshake and then fetches the
 * 204 target through that node, so the result is meaningful to the user.
 *
 * The native bridge is only called after the VPN core reports `connected`.
 * While disconnected we deliberately return null instead of showing a
 * protocol/TLS error duration as if it were network latency.
 */
export async function probeMihomoNodeLatency(
  name: string,
  connected: boolean,
  probe: NativeDelayProbe,
): Promise<number | null> {
  if (!connected || !name) return null

  try {
    const { delay } = await probe({
      name,
      url: MIHOMO_LATENCY_TEST_URL,
      timeout: MIHOMO_LATENCY_TIMEOUT_MS,
    })
    if (!Number.isFinite(delay) || delay < 0) return null
    return Math.round(delay)
  } catch {
    return null
  }
}
