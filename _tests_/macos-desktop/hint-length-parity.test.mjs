import assert from 'node:assert/strict'
import { test } from 'node:test'

import { toggleRowContextOf } from '../../_environments_/macos-desktop/environment.mjs'
import { accessRowContext, createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-840 (P1): helper 0.2.76 sends the window title (and farther names) as rowContext hints of up to 60 characters
// (RowContext.maxText) when a list heading or a nearer container wins. The desktop boundary kept only hints of at most 40
// and the policy read each hint to 40, so a 41-60 character title naming a right never reached the access-toggle rule.
// Each row goes the real way: the helper's rowContext through toggleRowContextOf, then policy.classify on a desktop toggle.

const policy = createPolicy({ sitePolicy: () => 'allow' })
const APP = 'com.example.toggle-fixture'
const verdict = (v) => (v.decision === 'allow' ? 'allow' : (v.classes ?? [v.class]).join('+'))
// A desktop toggle (role, own name, native state) whose helper row context is a heading-won list plus one hint.
const toggle = (role, hint, checked = false, list = 'General') => {
  const rowContext = toggleRowContextOf({ list, hints: [hint] })
  const target = { role, name: 'Example App', checked, inWebArea: false, origin: APP, ...(rowContext !== null ? { rowContext } : {}) }
  return verdict(policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: `desktop://${APP}`, target, frontmostBundleId: APP }))
}
const len = (text, min, max) => { assert.ok(text.length >= min && text.length <= max, `${text.length}: ${text}`); return text }

const RIGHTS = [
  // a right inside the first 40 characters of a 41-60 character title (the boundary dropped it)
  len('Allow the applications below to access your camera', 41, 60),
  len('Choose which apps may use the microphone on this Mac', 41, 60),
  // a right named only past character 40 (the policy's own 40 cut lost it too)
  len('Settings for the workspace window and its Location Services', 41, 60),
]
const HARMLESS = [
  len('Allow the applications below to show a badge icon', 41, 60),
  len('Choose which apps may show previews on this Mac here', 41, 60),
  len('Settings for the workspace window and its toolbar layout', 41, 60),
]

test('CU-840: a 41-60 character hint passes the boundary whole; over 60 is still dropped', () => {
  for (const hint of [...RIGHTS, ...HARMLESS, 'x'.repeat(60)]) assert.deepEqual(toggleRowContextOf({ hints: [hint] }), { hints: [hint] }, hint)
  assert.equal(toggleRowContextOf({ hints: ['x'.repeat(61)] }), null)
  assert.equal(accessRowContext({ list: 'General', hints: [RIGHTS[2]] }), true)
  assert.equal(accessRowContext({ list: 'General', hints: [HARMLESS[2]] }), false)
})

test('CU-840: each bound, both directions (member review round 97)', () => {
  // the boundary's hint length: 60 kept, 61 dropped (above); its list length: 60 kept, 61 dropped
  assert.deepEqual(toggleRowContextOf({ list: 'x'.repeat(60), hints: [] }), { list: 'x'.repeat(60), hints: [] })
  assert.equal(toggleRowContextOf({ list: 'x'.repeat(61), hints: [] }), null)
  // the boundary's hint count: 3 kept, a 4th dropped
  assert.deepEqual(toggleRowContextOf({ hints: ['a', 'b', 'c', 'Camera'] }), { hints: ['a', 'b', 'c'] })
  // the policy's own read of a hint: a right ending at character 58 counts, one cut at character 60 does not
  const near = `${'a'.repeat(51)} camera`
  const cut = `${'a'.repeat(54)} camera`
  assert.equal(near.length, 58); assert.equal(cut.length, 61)
  assert.equal(accessRowContext({ hints: [near] }), true)
  assert.equal(accessRowContext({ hints: [cut] }), false)
})

test('CU-840: a desktop toggle turned on under a 41-60 character title naming a right asks permission', () => {
  for (const role of ['AXSwitch', 'AXCheckBox']) {
    for (const hint of RIGHTS) assert.match(toggle(role, hint), /permission/, `${role}: ${hint}`)
  }
})

test('CU-840: the other side - harmless twins, turning off, and a title over 60 characters stay free', () => {
  for (const role of ['AXSwitch', 'AXCheckBox']) {
    for (const hint of HARMLESS) assert.equal(toggle(role, hint), 'allow', `${role}: ${hint}`)
    // over the helper's own 60: dropped at the boundary, as before (the helper never sends one)
    assert.equal(toggle(role, `${RIGHTS[0]} at all times`), 'allow', `${role}: over 60`)
  }
  // Turning off: only AXCheckBox has a native state on the desktop (nativeToggleState); an AXSwitch's state is unknown and
  // asks both ways under a right (CU-754's named over-ask), so its off row is not a free row.
  for (const hint of RIGHTS) assert.equal(toggle('AXCheckBox', hint, true), 'allow', `AXCheckBox off: ${hint}`)
})

test('CU-843: through the boundary, a 60-character grant header with a modified subject or a passive asks as hint and as list', () => {
  const filed = len('Allow the applications listed below to control your computer', 60, 60)
  const passive = len('Each application in this list below is allowed to control', 41, 60)
  for (const text of [filed, passive]) {
    assert.match(toggle('AXCheckBox', text), /permission/, `hint: ${text}`)
    assert.match(toggle('AXCheckBox', 'x', false, text), /permission/, `list: ${text}`)
    assert.equal(toggle('AXCheckBox', text, true), 'allow', `off: ${text}`)
  }
  // the harmless twin (another verb after 'to') stays free; one character over the bound is dropped at the boundary
  assert.equal(toggle('AXCheckBox', len('Allow the applications listed below to show a badge icon', 41, 60)), 'allow')
  assert.equal(toggle('AXCheckBox', len(`${filed}.`, 61, 61)), 'allow')
})
