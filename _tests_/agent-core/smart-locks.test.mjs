import assert from 'node:assert/strict'
import { test } from 'node:test'

import { grammarClasses } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-468 (High): smart-lock and alarm acts ask physical (CU-418's closed family) - auto-lock off, disarming, bypassing a zone,
// granting entry, a timed unlock; adding a lock user asks credential. Grammar table rows and switches. Click, Return and Space
// (D-106). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://home.example/lock/front-door'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Guest name', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const sw = (name, extra) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { name, ...extra } }); return v.decision === 'allow' ? 'allow' : v.class }
const native = (checked) => ({ tag: 'input', inputType: 'checkbox', role: 'switch', checked })

test('CU-468: lock and alarm acts ask physical; adding a lock user asks credential', () => {
  for (const [name, cls] of [['Turn off auto-lock', 'physical'], ['Disable auto-lock', 'physical'], ['Set to Disarmed', 'physical'], ['Disarm', 'physical'], ['Bypass zone', 'physical'],
    ['Grant entry', 'physical'], ['Open door', 'physical'], ['Unlock for 5 minutes', 'physical'], ['Add user to lock', 'credential']]) {
    assert.equal(click(name), cls, name)
    assert.equal(enter(name), cls, `Return: ${name}`)
    assert.equal(space(name), cls, `Space: ${name}`)
  }
  // Named (older classes lead; each asks either way): 'Create access code' and 'Share digital key' keep permission (ruled credential).
  for (const name of ['Create access code', 'Share digital key']) assert.equal(click(name), 'permission', `${name}: older class`)
  for (const [name, cls] of [['Switch auto-lock off', 'physical'], ['Bypass the sensor', 'physical'], ['Add a guest to the door', 'credential']]) assert.deepEqual(grammarClasses(name), [cls], `table row: ${name}`)
})

test('CU-468: auto-lock and armed switches ask OFF, free ON; desktop pins ask both ways', () => {
  for (const name of ['Auto-lock', 'Armed']) {
    assert.equal(sw(name, native(true)), 'physical', `${name} on -> off`)
    assert.equal(sw(name, native(false)), 'allow', `${name} off -> on`)
  }
  for (const checked of [true, false]) assert.equal(sw('Auto-lock', { role: 'AXCheckBox', subrole: 'AXSwitch', checked }), 'physical', `desktop pin ${checked}`)
})

test('CU-468 negatives: lock, set to armed, activity and the access log stay free; older over-asks named for CU-429', () => {
  for (const name of ['Lock', 'Set to Armed', 'Activity', 'Access log']) assert.equal(click(name), 'allow', name)
  // Named over-asks (CU-429): 'Arm away' (older physical) and 'Turn on auto-lock' (purchase today; not lowered here).
  assert.equal(click('Arm away'), 'physical')
  assert.equal(click('Turn on auto-lock'), 'purchase')
})
