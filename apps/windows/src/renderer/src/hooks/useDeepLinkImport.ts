import { useEffect } from 'react'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { parseImportDeepLink } from '@slave-vpn/shared'
import { deeplinkApi, events } from '../lib/api'
import { useSubscriptionsStore } from '../stores/subscriptions.store'
import { useUIStore } from '../stores/ui.store'

// Minimal surface of @capacitor/app, accessed via registerPlugin so the Windows
// renderer build doesn't need @capacitor/app as a dependency (the native module
// is linked into the APK by `cap sync`; we only call it on native platforms).
interface CapAppPlugin {
  getLaunchUrl(): Promise<{ url: string } | undefined>
  addListener(
    eventName: 'appUrlOpen',
    listenerFunc: (data: { url: string }) => void,
  ): Promise<{ remove: () => void }>
}
const CapApp = registerPlugin<CapAppPlugin>('App')

/**
 * Handles the `slavevpn://import/...` deep link on both platforms: adds the
 * subscription (or single proxy) it carries and notifies. Android reads the URL
 * via @capacitor/app (cold: getLaunchUrl, warm: appUrlOpen); Windows pulls the
 * launch link from the main process and listens for warm links over IPC.
 */
export function useDeepLinkImport(): void {
  const add = useSubscriptionsStore(s => s.add)
  const notify = useUIStore(s => s.notify)

  useEffect(() => {
    let cancelled = false

    const handle = async (raw: string | null | undefined): Promise<void> => {
      const parsed = parseImportDeepLink(raw)
      if (!parsed) return
      try {
        const entry = await add({ type: parsed.type, input: parsed.input })
        if (!cancelled) notify({ type: 'success', title: 'Подписка добавлена', message: entry.name })
      } catch (err) {
        if (!cancelled) {
          notify({
            type: 'error',
            title: 'Не удалось добавить подписку',
            message: err instanceof Error ? err.message : String(err),
          })
        }
      }
    }

    const cleanups: Array<() => void> = []

    if (Capacitor.isNativePlatform()) {
      void CapApp.getLaunchUrl().then(r => handle(r?.url))
      let remove: (() => void) | null = null
      void CapApp.addListener('appUrlOpen', d => void handle(d.url)).then(h => {
        if (cancelled) h.remove()
        else remove = () => h.remove()
      })
      cleanups.push(() => remove?.())
    } else {
      void deeplinkApi.getPending().then(r => handle(r.url))
      cleanups.push(events.onDeepLinkImport(url => void handle(url)))
    }

    return () => {
      cancelled = true
      cleanups.forEach(fn => fn())
    }
  }, [add, notify])
}
