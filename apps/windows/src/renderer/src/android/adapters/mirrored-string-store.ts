export interface LocalStringStore {
  get(key: string): string | null
  set(key: string, value: string): boolean
  remove(key: string): void
}

export interface AsyncStringMirror {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
}

export interface MirroredStringStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): void
}

export interface MirroredStringStoreOptions {
  /** Delays before retries after the initial mirror read. */
  retryDelaysMs?: readonly number[]
  delay?: (milliseconds: number) => Promise<void>
}

const defaultDelay = (milliseconds: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, milliseconds))

/**
 * localStorage-primary store with an asynchronous native mirror.
 *
 * Reads share one in-flight mirror hydration per key. A mirror that is briefly
 * unavailable (or reports null while the Capacitor plugin is initialising) is
 * retried for a bounded 250 ms. A concurrent set/remove increments the key's
 * generation, so an older mirror read can never resurrect stale data.
 */
export function createMirroredStringStore(
  local: LocalStringStore,
  mirror: AsyncStringMirror,
  options: MirroredStringStoreOptions = {},
): MirroredStringStore {
  const retryDelaysMs = options.retryDelaysMs ?? [30, 70, 150]
  const delay = options.delay ?? defaultDelay
  const inFlight = new Map<string, Promise<string | null>>()
  const generations = new Map<string, number>()
  const mutations = new Map<string, Promise<void>>()

  const generation = (key: string): number => generations.get(key) ?? 0
  const advance = (key: string): void => { generations.set(key, generation(key) + 1) }

  function enqueueMirrorMutation(key: string, mutate: () => Promise<void>): Promise<void> {
    const previous = mutations.get(key) ?? Promise.resolve()
    const pending = previous.catch(() => undefined).then(mutate)
    mutations.set(key, pending)
    const cleanup = (): void => {
      if (mutations.get(key) === pending) mutations.delete(key)
    }
    void pending.then(cleanup, cleanup)
    return pending
  }

  async function readMirror(key: string, startedAt: number): Promise<string | null> {
    for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
      try {
        const value = await mirror.get(key)
        if (value !== null) {
          // A local write/remove that happened while awaiting the mirror wins.
          if (generation(key) !== startedAt) return local.get(key)
          const current = local.get(key)
          if (current !== null) return current
          local.set(key, value)
          return value
        }
      } catch {
        // The Capacitor plugin may be registered but not ready on first access.
      }
      if (attempt < retryDelaysMs.length) await delay(retryDelaysMs[attempt]!)
    }
    return generation(key) === startedAt ? null : local.get(key)
  }

  return {
    async get(key) {
      const localValue = local.get(key)
      if (localValue !== null) return localValue

      const existing = inFlight.get(key)
      if (existing) return existing

      const startedAt = generation(key)
      const pending = readMirror(key, startedAt)
      inFlight.set(key, pending)
      try {
        return await pending
      } finally {
        if (inFlight.get(key) === pending) inFlight.delete(key)
      }
    },

    async set(key, value) {
      advance(key)
      if (local.set(key, value)) {
        void enqueueMirrorMutation(key, () => mirror.set(key, value)).catch(() => undefined)
        return
      }
      // localStorage is unavailable: the native mirror is now required.
      try {
        await enqueueMirrorMutation(key, () => mirror.set(key, value))
        if (await mirror.get(key) !== value) throw new Error('mirror verification failed')
      } catch {
        throw new Error('Both localStorage and Preferences failed to persist')
      }
    },

    remove(key) {
      advance(key)
      local.remove(key)
      void enqueueMirrorMutation(key, () => mirror.remove(key)).catch(() => undefined)
    },
  }
}
