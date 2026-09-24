import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CONNECTION_AUTO_GROUP,
  autoTargetUsesProxyGroup,
  planManualTarget,
} from '../src/renderer/src/stores/connection-target.ts'

test('desktop manual choice disables an active balancer before selecting the node', () => {
  assert.deepEqual(planManualTarget('Orel', false), {
    proxyName: 'Orel',
    disableDesktopBalancer: true,
  })
})

test('Android manual choice uses the native selector without a desktop balancer step', () => {
  assert.deepEqual(planManualTarget('Orel', true), {
    proxyName: 'Orel',
    disableDesktopBalancer: false,
  })
})

test('auto selection uses SLAVE-AUTO on Android and the balancer on desktop', () => {
  assert.equal(CONNECTION_AUTO_GROUP, 'SLAVE-AUTO')
  assert.equal(autoTargetUsesProxyGroup(true), true)
  assert.equal(autoTargetUsesProxyGroup(false), false)
})
