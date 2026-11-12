import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-548 (High; cu-coordinator 04:06Z), table PR 46: life-safety devices turned off ask physical everywhere; the switch forms take the
// safeguard direction rule. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://hub.example/devices'
const classesOf = (name, key = false) => {
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-548: life-safety buttons ask physical', () => {
  for (const name of ['Turn off smoke detector', 'Silence smoke alarm', 'Turn off CO detector', 'Disable carbon monoxide alarm', 'Disable leak sensor', 'Turn off water shutoff', 'Bypass automatic shutoff valve', 'Open water valve', 'Open main water supply']) {
    assert.ok(classesOf(name).includes('physical'), name)
    assert.ok(classesOf(name, true).includes('physical'), `Space: ${name}`)
  }
  for (const name of ['Silence alarm', 'Smoke detector', 'Leak sensor', 'Test smoke alarm', 'Close water valve']) assert.deepEqual(classesOf(name), [], name)
})

test('CU-548: the life-safety switches take the safeguard direction rule (on -> off and unread ask, off -> on free)', () => {
  for (const name of ['Smoke detector', 'CO detector', 'Leak sensor', 'Water shutoff']) {
    const sw = (checked) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'switch', name, ...(checked === undefined ? {} : { tag: 'input', inputType: 'checkbox', checked }) } }); return v.decision === 'allow' ? [] : (v.classes ?? [v.class]) }
    assert.ok(sw(true).includes('physical'), `${name}: on -> off asks`)
    assert.ok(sw(undefined).includes('physical'), `${name}: unread asks`)
    assert.deepEqual(sw(false), [], `${name}: off -> on is free`)
    const desk = (checked) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'desktop://com.example.home', target: { role: 'AXCheckBox', name, inWebArea: false, checked } }); return v.decision === 'allow' ? [] : (v.classes ?? [v.class]) }
    assert.ok(desk(true).includes('physical'), `${name}: desktop on -> off asks`)
    assert.deepEqual(desk(false), [], `${name}: desktop off -> on is free`)
  }
})

test("#798 round 2 (cu-researcher 04:10Z): 'Turn on / Open main water', 'Turn off the water detector'", () => {
  for (const name of ['Turn on main water', 'Open main water', 'Turn on the water', 'Turn off the water detector', 'Disable flood sensor']) assert.ok(classesOf(name).includes('physical'), name)
  for (const name of ['Water', 'Main water', 'Turn off water heater schedule']) assert.deepEqual(classesOf(name), [], name)
})

test("#798 round 3 (cu-developer-three 04:15Z): the 'Water / Flood detector' switches take the direction rule", () => {
  for (const name of ['Water detector', 'Flood detector', 'Flood sensor']) {
    const sw = (checked) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'switch', name, ...(checked === undefined ? {} : { tag: 'input', inputType: 'checkbox', checked }) } }); return v.decision === 'allow' ? [] : (v.classes ?? [v.class]) }
    assert.ok(sw(true).includes('physical'), `${name}: on -> off asks`)
    assert.ok(sw(undefined).includes('physical'), `${name}: unread asks`)
    assert.deepEqual(sw(false), [], `${name}: off -> on is free`)
  }
})
