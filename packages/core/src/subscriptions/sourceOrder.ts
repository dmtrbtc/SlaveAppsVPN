import type { SubscriptionEntry, SubscriptionSourceType } from './types.js'

const PRIORITY_STEP = 10

/** Stable identity used to prevent the same source from being imported twice. */
export function canonicalSubscriptionSource(
  type: SubscriptionSourceType,
  rawInput: string,
): string {
  const input = rawInput.trim()
  if (type === 'subscription-url') {
    try {
      const url = new URL(input)
      url.hash = ''
      return `${type}:${url.toString()}`
    } catch {
      // Invalid URLs are still compared deterministically; validation happens elsewhere.
    }
  }
  return `${type}:${input}`
}

export function sortSubscriptionsByPriority<T extends Pick<SubscriptionEntry, 'priority'>>(
  entries: readonly T[],
): T[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const ap = Number.isFinite(a.entry.priority) ? a.entry.priority! : a.index * PRIORITY_STEP
      const bp = Number.isFinite(b.entry.priority) ? b.entry.priority! : b.index * PRIORITY_STEP
      return ap - bp || a.index - b.index
    })
    .map(({ entry }) => entry)
}

export function normalizeSubscriptionPriorities<T extends SubscriptionEntry>(
  entries: readonly T[],
): T[] {
  return sortSubscriptionsByPriority(entries).map((entry, index) => ({
    ...entry,
    priority: (index + 1) * PRIORITY_STEP,
  }))
}

export interface SubscriptionSourceRecord<T extends SubscriptionEntry> {
  entry: T
  input: string | null
}

export function deduplicateSubscriptionSources<T extends SubscriptionEntry>(
  records: readonly SubscriptionSourceRecord<T>[],
): { entries: T[]; duplicateIds: string[] } {
  const ordered = normalizeSubscriptionPriorities(records.map(record => record.entry))
  const inputById = new Map(records.map(record => [record.entry.id, record.input]))
  const seen = new Set<string>()
  const duplicateIds: string[] = []
  const entries = ordered.filter(entry => {
    const input = inputById.get(entry.id)
    if (!input) return true
    const identity = canonicalSubscriptionSource(entry.type, input)
    if (seen.has(identity)) {
      duplicateIds.push(entry.id)
      return false
    }
    seen.add(identity)
    return true
  })
  return { entries: normalizeSubscriptionPriorities(entries), duplicateIds }
}

export function reorderSubscriptionsByIds<T extends SubscriptionEntry>(
  entries: readonly T[],
  ids: readonly string[],
): T[] {
  if (ids.length !== entries.length || new Set(ids).size !== ids.length) {
    throw new Error('Subscription order must contain every entry exactly once')
  }
  const byId = new Map(entries.map(entry => [entry.id, entry]))
  const reordered = ids.map(id => byId.get(id))
  if (reordered.some(entry => !entry)) {
    throw new Error('Subscription order contains an unknown entry')
  }
  return reordered.map((entry, index) => ({
    ...entry!,
    priority: (index + 1) * PRIORITY_STEP,
  }))
}
