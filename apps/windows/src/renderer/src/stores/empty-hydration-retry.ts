export interface EmptyHydrationRetryOptions {
  delaysMs?: readonly number[]
  delay?: (milliseconds: number) => Promise<void>
}

const defaultDelay = (milliseconds: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, milliseconds))

/**
 * Quietly re-read initially empty Android state while the OS may still be
 * restoring Capacitor Preferences. Stops on data, disposal, or after ~2 min.
 */
export async function retryEmptyHydration(
  read: () => Promise<void>,
  shouldContinue: () => boolean,
  options: EmptyHydrationRetryOptions = {},
): Promise<void> {
  const delaysMs = options.delaysMs ?? [500, 1_500, 3_000, 5_000, 10_000, 20_000, 30_000, 60_000]
  const delay = options.delay ?? defaultDelay
  for (const milliseconds of delaysMs) {
    await delay(milliseconds)
    if (!shouldContinue()) return
    await read()
    if (!shouldContinue()) return
  }
}
