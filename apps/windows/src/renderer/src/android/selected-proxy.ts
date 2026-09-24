export const ANDROID_AUTO_GROUP = 'SLAVE-AUTO'

export function resolveAvailableAndroidSelection(
  selectedProxy: string | undefined,
  availableNames: readonly string[],
): { selectedProxy: string | undefined; resetToAuto: boolean } {
  const selected = selectedProxy?.trim()
  if (!selected || selected === ANDROID_AUTO_GROUP || availableNames.includes(selected)) {
    return { selectedProxy: selected || undefined, resetToAuto: false }
  }
  return { selectedProxy: ANDROID_AUTO_GROUP, resetToAuto: true }
}
