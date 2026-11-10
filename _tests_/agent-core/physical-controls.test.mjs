import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createExclusions } from '../../_tools_/agent-core/exclusions.mjs'
import { CLASSES, NEVER_PRE_APPROVED, createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-395 (High): physical-world controls - a lock, a garage door, an alarm, a lost device - ask 'physical' each time in any
// app; Home and Find My are excluded outright.
const policy = createPolicy({ sitePolicy: () => 'allow', preApproved: [{ class: 'physical' }, { class: 'permission' }] })
const click = (name, url = 'https://home.example/') => policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })

test('CU-395: Unlock, Open Garage Door, Disarm and Mark As Lost ask physical, each time, and cannot be pre-approved', () => {
  for (const name of ['Unlock', 'Unlock Front Door', 'Open Garage Door', 'Disarm', 'Disarm Security System', 'Mark As Lost', 'Erase This Device', 'Garage Door']) {
    const v = click(name)
    assert.equal(v.class, 'physical', name)
    assert.equal(v.askEachTime, true, name)
  }
  assert.ok(CLASSES.includes('physical') && NEVER_PRE_APPROVED.includes('physical'))
  const desktop = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'app:com.example.smarthome', frontmostBundleId: 'com.example.smarthome', target: { origin: 'com.example.smarthome', role: 'AXButton', name: 'Unlock Front Door' } })
  assert.equal(desktop.class, 'physical', 'a third-party home app on the desktop')
})

test('CU-395 negatives: Lock, Open and Arm stay free', () => {
  for (const name of ['Lock', 'Open', 'Arm Away', 'Close Garage Door']) assert.equal(click(name).decision, 'allow', name)
})

test('CU-395: Home and Find My are excluded as physical_control', () => {
  const { isExcludedApp } = createExclusions()
  for (const id of ['com.apple.Home', 'com.apple.findmy']) assert.equal(isExcludedApp(id).kind, 'physical_control', id)
})
