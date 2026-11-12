import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-549 + CU-550 (High; cu-coordinator 04:51Z), table PR 47: a router's exposure asks permission; a carrier's plan / line / device
// changes ask purchase, suspending a line or pausing service asks delete. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, key = false) => {
  const url = 'https://account.example/settings'
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-549: router exposure asks permission', () => {
  for (const name of ['Forward port 22', 'Forward ports 8000-8080', 'Add port forwarding rule', 'Allow remote administration', 'Enable remote access from WAN', 'Make network open', 'Set Wi-Fi security to open', 'Disable client isolation', 'Turn off AP isolation', 'Enable WPS']) {
    assert.ok(classesOf(name).includes('permission'), name)
    assert.ok(classesOf(name, true).includes('permission'), `Space: ${name}`)
  }
  for (const name of ['Remote administration', 'WPS', 'Disable WPS', 'Client isolation']) assert.deepEqual(classesOf(name), [], name)
  assert.notDeepEqual(classesOf('Port forwarding'), [], 'the older port-forwarding label keeps its ask')
})

test('CU-550: carrier plan / line / device changes ask purchase; suspend / pause ask delete', () => {
  for (const [name, cls] of [['Change plan', 'purchase'], ['Switch plan', 'purchase'], ['Change my plan', 'purchase'], ['Add a line', 'purchase'], ['Add a new line', 'purchase'], ['Upgrade device', 'purchase'], ['Upgrade my phone', 'purchase'], ['Suspend line', 'delete'], ['Suspend this line', 'delete'], ['Pause service', 'delete']]) {
    assert.ok(classesOf(name).includes(cls), name)
    assert.ok(classesOf(name, true).includes(cls), `Space: ${name}`)
  }
  for (const name of ['Plans', 'My lines', 'Devices', 'Compare plans']) assert.deepEqual(classesOf(name), [], name)
  for (const [name, cls] of [['Upgrade plan', 'purchase'], ['Cancel line', 'delete']]) assert.ok(classesOf(name).includes(cls), `older row: ${name}`)
})
