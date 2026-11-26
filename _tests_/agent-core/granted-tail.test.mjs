import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-824 (P2 under-ask, found in cu-researcher's #1486 r2 review): 'Let visitors control the thermostat' went free because
// the grammar's label guard read 'control' as a trailing settings noun ('Parental controls'). A tail word that is the act
// granted to people over an object - let / allow, a people word, the word, then its object - is a verb: the guard no longer
// frees it, so the grant keeps its ask. Labels stay free. No device is listed (cu-coordinator: allowlist design only).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const verdict = (v) => (v.decision === 'allow' ? 'allow' : (v.classes ?? [v.class]).join('+'))
const press = (url, target, extra = {}) => verdict(policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target, ...extra }))
const HOME = 'com.example.homehub'
const sw = (name) => press('https://home.example/settings', { role: 'switch', tag: 'button', name, checked: false })
const button = (name) => press('https://home.example/settings', { role: 'button', tag: 'button', name })
const axcb = (name) => press(`desktop://${HOME}`, { role: 'AXCheckBox', name, checked: false, inWebArea: false, origin: HOME }, { frontmostBundleId: HOME })

test('CU-824: the filed row - a visitor grant over a home device asks physical', () => {
  assert.match(sw('Let visitors control the thermostat'), /physical/)
  assert.match(axcb('Let visitors control the thermostat'), /physical/)
})

test('CU-824: the grant shapes keep their ask on every route - let / allow people control a device', () => {
  for (const name of ['Let visitors control the thermostat', 'Allow guests to control the lights', 'Let guests control the blinds',
    'Let guests control the speakers']) {
    assert.notEqual(sw(name), 'allow', name)
    assert.notEqual(button(name), 'allow', `button: ${name}`)
    assert.notEqual(axcb(name), 'allow', `desktop: ${name}`)
  }
})

test('CU-824: labels with a tail word stay free - no grant shape, no people word before the word, or no object after it', () => {
  for (const name of ['Guest controls', 'Parental controls', 'Notification settings', 'Visitor history', 'Let me control notifications',
    'Allow notification control', 'Privacy controls', 'Allow guest settings', 'Let visitors control']) {
    assert.equal(button(name), 'allow', name)
  }
})
