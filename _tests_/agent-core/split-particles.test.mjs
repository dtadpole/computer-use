import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-450 (High; cu-coordinator 22:05Z, follow-up to #580): the split-particle canonical form reaches the OLDER lists too - a
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

test('CU-450: word-order parity - every turn / switch X on|off matches its canonical form, web and desktop, except the named over-asks', () => {
  const objects = ['notifications', 'dark mode', 'sounds', 'captions', 'autoplay', 'location sharing', 'sharing location', 'two-factor authentication', 'the firewall',
    'privacy mode', 'ads', 'auto-renew', 'call forwarding', 'SafeSearch', 'the alarm', 'the heater', 'the oven', 'read receipts', 'backups', 'sync', 'Bluetooth',
    'the VPN', 'audit logging', 'parental controls', 'Find My', 'the lights', 'it']
  // Named (cu-researcher 22:04Z, CU-429's family - the follow-up only adds asks): the older two-factor and forwarding words read
  // anywhere in the name, so the split order asks credential where the canonical order is free or permission.
  const named = new Set(['Turn two-factor authentication on', 'Turn two-factor authentication off', 'Turn call forwarding off'])
  const verdict = (name, desk) => {
    const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, desk ? { url: 'app:com.example.settingsapp', target: { role: 'AXButton', name } } : { url: 'https://app.example/settings', target: { role: 'button', name } })
    return v.decision === 'allow' ? 'allow' : v.class
  }
  for (const verb of ['Turn', 'Switch']) for (const q of ['on', 'off']) for (const x of objects) for (const desk of [false, true]) {
    const split = `${verb} ${x} ${q}`
    if (named.has(split)) { assert.notEqual(verdict(split, desk), 'allow', `${split} asks (named over-ask)`); continue }
    assert.equal(verdict(split, desk), verdict(`${verb} ${q} ${x}`, desk), `${desk ? 'desk' : 'web'}: ${split}`)
  }
})
