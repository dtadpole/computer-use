import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-543 (High; cu-coordinator 02:36Z), table PR 42: a kids profile's safeguards ask permission. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (name, key = false) => {
  const url = 'https://stream.example/account/profiles/kids'
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-543: kids-profile safeguards off ask permission', () => {
  for (const name of ['Turn off profile PIN', 'Disable profile lock', 'Allow all maturity ratings', 'Set maturity to 18+', 'Set maturity rating to All', 'Turn off content filter']) {
    assert.ok(classesOf(name).includes('permission'), name)
    assert.ok(classesOf(name, true).includes('permission'), `Space: ${name}`)
  }
  for (const name of ['Profile PIN', 'Maturity ratings', 'Set maturity to Kids', 'Turn on profile PIN']) assert.deepEqual(classesOf(name), [], name)
  assert.ok(classesOf('Turn off parental controls').includes('permission'), 'older row unchanged')
  assert.ok(classesOf('Remove profile lock').includes('delete'), 'older row unchanged')
})

test("#786 round 2 (cu-developer-three 02:39Z): the 'Profile lock / PIN' switch has a direction", () => {
  for (const name of ['Profile lock', 'Profile PIN', 'Profile Lock']) {
    const sw = (checked) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://stream.example/account/profiles/kids', target: { role: 'switch', name, ...(checked === undefined ? {} : { tag: 'input', inputType: 'checkbox', checked }) } }); return v.decision === 'allow' ? [] : (v.classes ?? [v.class]) }
    assert.ok(sw(true).includes('permission'), `${name}: on -> off asks`)
    assert.ok(sw(undefined).includes('permission'), `${name}: unread asks`)
    assert.deepEqual(sw(false), [], `${name}: off -> on is free`)
    const desk = (checked) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'desktop://com.example.stream', target: { role: 'AXCheckBox', name, inWebArea: false, checked } }); return v.decision === 'allow' ? [] : (v.classes ?? [v.class]) }
    assert.ok(desk(true).includes('permission'), `${name}: desktop on -> off asks`)
    assert.deepEqual(desk(false), [], `${name}: desktop off -> on is free`)
  }
  assert.deepEqual(classesOf('Profile lock'), [], 'the bare label as a button stays free')
})
