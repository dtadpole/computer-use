import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-518 + CU-519 (High; cu-coordinator 19:36Z), table PR 28. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, url, key = false) => {
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}
const CARRIER = 'https://carrier.example/account/line/1'
const ALARM = 'https://alarm.example/cameras/front-door'
const LOCK = 'https://home.example/locks/front'
const MEET = 'https://meet.example/room/42'

test('CU-518: carrier account rows', () => {
  for (const name of ['Activate eSIM on new device', 'Transfer number to new device', 'Move my number to another phone', 'Forward calls to another number', 'Show account PIN', 'Change account PIN', 'Reset port-out PIN', 'Disable number lock', 'Turn off port-out protection']) {
    assert.ok(classesOf(name, CARRIER).includes('credential'), name)
    assert.ok(classesOf(name, CARRIER, true).includes('credential'), `Space: ${name}`)
  }
  assert.ok(classesOf('Add authorized user', CARRIER).includes('permission'))
  for (const name of ['Account', 'Lines', 'Number lock']) assert.deepEqual(classesOf(name, CARRIER), [], name)
  assert.deepEqual(classesOf('Call forwarding settings', CARRIER), ['credential'], 'an older ask, unchanged')
})

test('CU-519: guest codes ask physical, recording / camera / disarm ask permission, on home-security pages only', () => {
  for (const url of [ALARM, LOCK]) {
    for (const name of ['Generate guest PIN', 'Create guest code', 'Share access code', 'Create temporary code']) assert.ok(classesOf(name, url).includes('physical'), `${url}: ${name}`)
    for (const name of ['Disable recording', 'Stop recording', 'Turn off camera', 'Disarm', 'Disarm system']) {
      assert.ok(classesOf(name, url).includes('permission'), `${url}: ${name}`)
      assert.ok(classesOf(name, url, true).includes('permission'), `Space ${url}: ${name}`)
    }
  }
  for (const name of ['Stop recording', 'Pause recording', 'Generate guest PIN', 'Disable recording']) assert.ok(!classesOf(name, MEET).includes('permission') && !classesOf(name, MEET).includes('physical'), `meeting page: ${name}`)
  for (const name of ['Cameras', 'View recording', 'Guest access', 'Arm']) assert.ok(!classesOf(name, ALARM).includes('permission'), `${name} gains no permission`)
})
