import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ANDROID_AUTO_GROUP,
  resolveAvailableAndroidSelection,
} from '../src/renderer/src/android/selected-proxy.ts'

test('keeps an available Android manual selection', () => {
  assert.deepEqual(resolveAvailableAndroidSelection('Orel', ['NL', 'Orel']), {
    selectedProxy: 'Orel',
    resetToAuto: false,
  })
})

test('replaces a removed Android selection with AUTO before native start', () => {
  assert.deepEqual(resolveAvailableAndroidSelection('Removed', ['NL', 'EE']), {
    selectedProxy: ANDROID_AUTO_GROUP,
    resetToAuto: true,
  })
})

test('preserves explicit AUTO and an empty first-run selection', () => {
  assert.deepEqual(resolveAvailableAndroidSelection(ANDROID_AUTO_GROUP, ['NL']), {
    selectedProxy: ANDROID_AUTO_GROUP,
    resetToAuto: false,
  })
  assert.deepEqual(resolveAvailableAndroidSelection(undefined, ['NL']), {
    selectedProxy: undefined,
    resetToAuto: false,
  })
})
