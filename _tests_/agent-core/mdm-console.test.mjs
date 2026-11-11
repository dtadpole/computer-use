import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-512 (High; cu-coordinator 17:51Z), table PR 25: an MDM console's device controls ask. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, key = false) => {
  const url = 'https://mdm.example/devices/123'
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-512: credential rows', () => {
  for (const name of ['Clear Activation Lock', 'Bypass Activation Lock', 'Disable Activation Lock', 'Clear passcode', 'Reset passcode', 'Disable passcode requirement', 'Turn off passcode requirement', "Don't require passcode"]) {
    assert.ok(classesOf(name).includes('credential'), name)
    assert.ok(classesOf(name, true).includes('credential'), `Space: ${name}`)
  }
})

test('CU-512: permission rows', () => {
  for (const name of ['Turn off Lost Mode', 'Disable Lost Mode', 'Exit Lost Mode', 'Unenroll device', 'Retire device', 'Retire devices', 'Push profile', 'Push configuration profile', 'Assign profile']) {
    assert.ok(classesOf(name).includes('permission'), name)
    assert.ok(classesOf(name, true).includes('permission'), `Space: ${name}`)
  }
})

test('CU-512: older classes lead; views stay free', () => {
  assert.deepEqual(classesOf('Install profile'), ['install'])
  // #716 round 2 (cu-coordinator 18:06Z): 'Deploy profile' unions permission onto its older submit.
  assert.ok(classesOf('Deploy profile').includes('submit') && classesOf('Deploy profile').includes('permission'))
  assert.deepEqual(classesOf('Remove passcode'), ['delete'])
  assert.deepEqual(classesOf('Remove device from management'), ['delete'], 'the older remove row leads; it asks')
  for (const name of ['Devices', 'Activation Lock status', 'Lost Mode', 'Profiles', 'Passcode policy']) assert.deepEqual(classesOf(name), [], name)
})

test('#716 round 2 (cu-coordinator 18:06Z): the older-delete forms union credential', () => {
  for (const name of ['Remove Activation Lock', 'Clear device passcode']) {
    const got = classesOf(name)
    assert.ok(got.includes('delete') && got.includes('credential'), `${name}: ${got}`)
  }
  assert.deepEqual(classesOf('Install profile'), ['install'], 'not in the ruling: unchanged')
  assert.deepEqual(classesOf('Remove passcode'), ['delete'], 'not in the ruling: unchanged')
})
