import { useSettings } from './useSettings'
import { useFeatureAvailable } from './useProvider'
import type { AppFeatureFlag } from '@shared/ipc/types'

export function useFeatureFlag(flag: AppFeatureFlag): boolean {
  const { data: settings } = useSettings()

  // These flags are derived from settings
  switch (flag) {
    case 'devMode':
      return settings?.devMode ?? false
    case 'diagnosticsExport':
      return true
    case 'killSwitch':
      return true
    default:
      return false
  }
}

// Provider-capability-backed feature flags
export function useProviderFeature(feature: Parameters<typeof useFeatureAvailable>[0]): boolean {
  return useFeatureAvailable(feature)
}
