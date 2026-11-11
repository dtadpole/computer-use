import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createExclusions } from '../../_tools_/agent-core/exclusions.mjs'
import { CLASSES, NEVER_PRE_APPROVED, createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-395 (High): physical-world controls - a lock, a garage door, an alarm, a lost device - ask 'physical' each time in any
// app; Home and Find My are excluded outright.
const policy = createPolicy({ sitePolicy: () => 'allow', preApproved: [{ class: 'physical' }, { class: 'permission' }] })
const click = (name, url = 'https://home.example/') => policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })

test('CU-395: Unlock, Open Garage Door, Disarm and Mark As Lost ask physical, each time, and cannot be pre-approved', () => {
  for (const name of ['Unlock Front Door', 'Unlock door', 'Front Door: Unlock', 'Open Garage Door', 'Disarm', 'Disarm Security System', 'Mark As Lost', 'Erase This Device', 'Garage Door', 'Arm Away', 'Arm Stay', 'Arm alarm', 'Arm Night', 'Arm Home', 'Lock this device', 'Lock iPhone', 'Lock this Mac', 'Open front door', 'Open door', 'Open the door', 'Open back door']) {
    const v = click(name)
    assert.equal(v.class, 'physical', name)
    assert.equal(v.askEachTime, true, name)
  }
  assert.ok(CLASSES.includes('physical') && NEVER_PRE_APPROVED.includes('physical'))
  const desktop = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'app:com.example.smarthome', frontmostBundleId: 'com.example.smarthome', target: { origin: 'com.example.smarthome', role: 'AXButton', name: 'Unlock Front Door' } })
  assert.equal(desktop.class, 'physical', 'a third-party home app on the desktop')
})

test('CU-395 negatives: Lock, Open and Arm stay free', () => {
  for (const name of ['Lock', 'Open', 'Arm', 'Close Garage Door', 'Lock screen', 'Open document', 'Lock Front Door', 'Unlock', 'Unlock all features', 'Unlock full article']) assert.equal(click(name).decision, 'allow', name)
  // CU-514 (cu-coordinator 18:21Z): 'Unlock account' is raised to credential - an explicit raise of this free pin.
  assert.equal(click('Unlock account').class, 'credential')
  // CU-428 (cu-coordinator 16:45Z) re-judges a paid tier: 'Unlock Pro' / 'Unlock Premium' ask purchase, never physical (D-100).
  for (const name of ['Unlock Premium', 'Unlock Pro']) assert.equal(click(name).class, 'purchase', name)
})

test('CU-395: Home and Find My are excluded as physical_control', () => {
  const { isExcludedApp } = createExclusions()
  for (const id of ['com.apple.Home', 'com.apple.findmy']) assert.equal(isExcludedApp(id).kind, 'physical_control', id)
})

test('CU-395 round 2: Return or Space on a focused physical control asks physical (the CU-381/386 keyboard route)', () => {
  for (const keys of [['RETURN'], ['SPACE']]) {
    for (const [url, front, target] of [['app:com.vendor.home', 'com.vendor.home', { origin: 'com.vendor.home', role: 'AXButton', name: 'Unlock Front Door' }], ['https://home.example/', undefined, { tag: 'button', role: 'button', name: 'Open Garage Door' }]]) {
      const v = policy.classify({ type: 'keypress', keys }, { url, frontmostBundleId: front, target })
      assert.equal(v.class, 'physical', `${keys[0]} on ${url}`)
      assert.equal(v.askEachTime, true)
    }
  }
})
