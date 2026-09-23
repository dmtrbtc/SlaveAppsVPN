import { useCallback, useEffect, useRef, useState } from 'react'
import { subscriptionsApi } from '../lib/api'
import type { ClipboardDetectResult } from '@shared/ipc/types'

// Polls clipboard when the window regains focus. Keeps the last suggested URI
// in memory (NOT persisted) so we don't re-prompt the user for the same link.
// To re-suggest after dismissal: copy the link again with anything else in between.

export interface ClipboardSuggestion extends ClipboardDetectResult {
  isVisible: boolean
}

const EMPTY: ClipboardSuggestion = { found: false, isVisible: false }

export function useClipboardSuggestion(): {
  suggestion: ClipboardSuggestion
  dismiss: () => void
  checkNow: () => Promise<void>
} {
  const [suggestion, setSuggestion] = useState<ClipboardSuggestion>(EMPTY)
  const lastSeenInput = useRef<string | null>(null)
  const dismissedInput = useRef<string | null>(null)

  const checkNow = useCallback(async () => {
    try {
      const result = await subscriptionsApi.detectClipboard()
      if (!result.found || !result.input) {
        setSuggestion(EMPTY)
        return
      }
      // Same URI we already showed → don't reopen
      if (result.input === lastSeenInput.current) return
      // User dismissed this exact URI before — don't nag
      if (result.input === dismissedInput.current) {
        lastSeenInput.current = result.input
        return
      }
      lastSeenInput.current = result.input
      setSuggestion({ ...result, isVisible: true })
    } catch {
      // Non-fatal — clipboard might be empty or unreadable
      setSuggestion(EMPTY)
    }
  }, [])

  const dismiss = useCallback(() => {
    dismissedInput.current = lastSeenInput.current
    setSuggestion(EMPTY)
  }, [])

  useEffect(() => {
    const onFocus = (): void => { void checkNow() }
    window.addEventListener('focus', onFocus)
    // Initial check after mount — covers app-start case (Karing-style)
    void checkNow()
    return () => window.removeEventListener('focus', onFocus)
  }, [checkNow])

  return { suggestion, dismiss, checkNow }
}
