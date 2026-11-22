import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

// Pin the same AAR used in the Android Wi-Fi/LTE acceptance runs. In particular,
// a successful APK build must not silently drop the FinalMask helper or NAT64.
const path = new URL('../apps/android/libs/clashbox.aar', import.meta.url)
const expected = 'cfd1b86b7a0586ab4b8fc32ac6057867457da3783d4a66269467bc5296278cbe'
const actual = createHash('sha256').update(readFileSync(path)).digest('hex')
if (actual !== expected) {
  throw new Error(`Android AAR mismatch: expected ${expected}, got ${actual}`)
}
console.log('[android-core] PASS: accepted v1.19.30-slave.5-xray AAR')
