import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-557 (High; cu-coordinator 06:36Z, class corrected 06:37Z), table PR 51: enabling futures / derivatives asks permission, like the
// older options / margin / leverage rows. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, key = false) => {
  const url = 'https://exchange.example/account/settings'
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-557: enabling futures / derivatives asks permission', () => {
  for (const name of ['Enable futures', 'Enable futures trading', 'Enable derivatives', 'Open futures account', 'Activate derivatives trading', 'Open a perpetuals account']) {
    assert.ok(classesOf(name).includes('permission'), name)
    assert.ok(classesOf(name, true).includes('permission'), `Space: ${name}`)
  }
  for (const name of ['Futures', 'Derivatives', 'Learn about futures']) assert.deepEqual(classesOf(name), [], name)
  for (const name of ['Enable margin trading', 'Enable leverage']) assert.ok(classesOf(name).includes('permission'), `older row: ${name}`)
})

test('#821 round 2 (cu-researcher 07:29Z): the whole futures / derivatives family', () => {
  for (const name of ['Unlock perpetual contracts', 'Activate derivatives wallet', 'Start trading futures', 'Open a margin account', 'Begin trading perpetuals']) assert.ok(classesOf(name).includes('permission'), name)
  for (const name of ['Trading', 'Open account']) assert.deepEqual(classesOf(name), [], name)
})
