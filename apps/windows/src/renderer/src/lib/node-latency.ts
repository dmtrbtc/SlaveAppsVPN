/** null is a failed probe; undefined means no probe has been received yet. */
export function resolveNodeLatency(
  measured: number | null | undefined,
  fallback?: number | null,
): number | null {
  const value = measured === undefined ? fallback : measured
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 65535
    ? Math.round(value)
    : null
}
