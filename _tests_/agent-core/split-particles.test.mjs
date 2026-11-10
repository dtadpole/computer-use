import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// cu-coordinator 22:02Z (High follow-up to #580): the split-particle canonical form reaches the OLDER lists too - a
// 'turn / switch X on|off' control is judged as 'turn / switch on|off X' by every rule, one probe, only adding asks.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name, target = {}) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/settings', target: { role: 'button', name, ...target } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: 'https://app.example/settings', target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('split particles: the three escapes of closed Highs ask as their canonical form does', () => {
  for (const [split, canonical] of [['Turn location sharing on', 'Turn on location sharing'], ['Turn Find My off', 'Turn off Find My'], ['Switch the heater on', 'Switch on the heater']]) {
    const want = click(canonical)
    assert.notEqual(want, 'allow', `${canonical} asks today`)
    assert.equal(click(split), want, split)
    assert.equal(space(split), want, `Space: ${split}`)
  }
})

test('split particles: free canonical forms stay free; a native checkbox already on does not probe; no recursion', () => {
  for (const name of ['Turn notifications on', 'Turn dark mode on', 'Switch theme off', 'Turn on', 'Turn it off']) assert.equal(click(name), 'allow', name)
  assert.equal(click('Turn location sharing on', { role: 'checkbox', tag: 'input', inputType: 'checkbox', checked: true }), 'allow', 'native on -> off')
})
