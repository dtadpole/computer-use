import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-534 + CU-535 (High; cu-coordinator 00:51Z), table PR 37: a calendar's exposure and wipe; a VPN's safeguards. Click and Space.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, key = false) => {
  const url = 'https://app.example/settings'
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-534: calendar exposure asks permission, a wipe asks delete', () => {
  for (const [name, cls] of [['Get public iCal address', 'permission'], ['Get public address in iCal format', 'permission'], ['Get secret address in iCal format', 'permission'], ['Get shareable link to calendar', 'permission'], ['Clear calendar', 'delete'], ['Delete all events', 'delete']]) {
    assert.ok(classesOf(name).includes(cls), name)
    assert.ok(classesOf(name, true).includes(cls), `Space: ${name}`)
  }
  for (const name of ['Calendar settings', 'iCal format', 'Integrate calendar']) assert.deepEqual(classesOf(name), [], name)
})

test('CU-535: VPN safeguards off ask permission, a config download asks credential', () => {
  for (const [name, cls] of [['Turn off kill switch', 'permission'], ['Enable split tunneling', 'permission'], ['Exclude apps from VPN', 'permission'], ['Trust this network', 'permission'], ['Download config file', 'credential'], ['Download WireGuard configuration', 'credential']]) {
    assert.ok(classesOf(name).includes(cls), name)
    assert.ok(classesOf(name, true).includes(cls), `Space: ${name}`)
  }
  for (const name of ['Disconnect', 'Pause VPN', 'Change server', 'Kill switch', 'Split tunneling']) assert.deepEqual(classesOf(name), [], name)
  assert.deepEqual(classesOf('Trust this computer'), [], 'CU-286 exclusion unchanged')
})
