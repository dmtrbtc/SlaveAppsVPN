/**
 * Deprecated — superseded by apps/windows/src/renderer/src/android/.
 *
 * The bridge is now built INTO the shared renderer bundle and activated
 * via feature detection (window.Capacitor) at boot. See:
 *
 *   apps/windows/src/renderer/src/main.tsx
 *     → installAndroidBridgeIfNeeded()
 *       → apps/windows/src/renderer/src/android/bridge.ts
 *
 * This file is kept only as a documentation marker and intentionally
 * exports nothing. It will be deleted in a follow-up cleanup.
 */
export {}
