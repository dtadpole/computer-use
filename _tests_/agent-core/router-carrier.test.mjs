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

test('#805 round 2 (05:05Z): the held-out forms; the router switches take their direction rules', () => {
  for (const [name, cls] of [['Forward external port 3389 to this device', 'permission'], ['Turn on remote admin access', 'permission'], ['Move to the Premium plan', 'purchase'], ['Change to Unlimited plan', 'purchase'], ['Temporarily suspend service', 'delete'], ['Suspend service', 'delete']]) assert.ok(classesOf(name).includes(cls), name)
  const sw = (name, checked) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://router.example/wireless', target: { role: 'switch', name, ...(checked === undefined ? {} : { tag: 'input', inputType: 'checkbox', checked }) } }); return v.decision === 'allow' ? [] : (v.classes ?? [v.class]) }
  assert.ok(sw('Client isolation', true).includes('permission'), 'isolation on -> off asks')
  assert.ok(sw('Client isolation', undefined).includes('permission'), 'isolation unread asks')
  assert.deepEqual(sw('Client isolation', false), [], 'isolation off -> on is free')
  assert.ok(sw('WPS', false).includes('permission'), 'WPS off -> on asks')
  assert.ok(sw('WPS', undefined).includes('permission'), 'WPS unread asks')
  assert.deepEqual(sw('WPS', true), [], 'WPS on -> off is free')
  for (const name of ['Plan details', 'Change to dark mode']) assert.deepEqual(classesOf(name), [], name)
})

test('#805 round 3 (cu-researcher 05:17Z): the forward target may be an address', () => {
  for (const name of ['Forward ports 80 to 192.0.2.5', 'Forward port 443 to 198.51.100.12:8443', 'Forward port 22 to my NAS']) assert.ok(classesOf(name).includes('permission'), name)
})

test("#805 round 3 (cu-coordinator 05:21Z): 'Change to <plan name>' asks purchase on a carrier plan page only", () => {
  const at = (name, url) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } }); return v.decision === 'allow' ? [] : (v.classes ?? [v.class]) }
  for (const url of ['https://carrier.example/account/plans', 'https://www.example-wireless.example/wireless/my-plan']) for (const name of ['Change to Unlimited Plus', 'Switch to Basic', 'Move to Premium']) assert.ok(at(name, url).includes('purchase'), `${url}: ${name}`)
  for (const name of ['Change to Unlimited Plus', 'Change to dark mode']) assert.deepEqual(at(name, 'https://app.example/settings'), [], `off a plan page: ${name}`)
})
