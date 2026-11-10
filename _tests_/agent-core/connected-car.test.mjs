import assert from 'node:assert/strict'
import { test } from 'node:test'

import { grammarClasses } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-460 (High): a connected car - summoning, opening the trunk or windows, starting climate, honking and flashing ask physical
// (CU-418 family); turning off Sentry Mode asks permission; disabling PIN to drive and adding a key ask credential. Grammar table
// rows and switches. Click, Return and Space (D-106). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://car.example/vehicle/1'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Destination', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const sw = (name, extra) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { name, ...extra } }); return v.decision === 'allow' ? 'allow' : v.class }
const native = (checked) => ({ tag: 'input', inputType: 'checkbox', role: 'switch', checked })

test('CU-460: moving or opening the car asks physical; Sentry off permission; PIN to drive off and keys credential', () => {
  const rows = [['Summon', 'physical'], ['Smart Summon', 'physical'], ['Open trunk', 'physical'], ['Open frunk', 'physical'], ['Unlock car', 'physical'], ['Vent windows', 'physical'],
    ['Open windows', 'physical'], ['Start climate', 'physical'], ['Honk', 'physical'], ['Flash lights', 'physical'], ['Turn off Sentry Mode', 'permission'], ['Disable Sentry Mode', 'permission'],
    ['Disable PIN to drive', 'credential'], ['Turn off PIN to drive', 'credential'], ['Add phone key', 'credential'], ['Add key', 'credential']]
  for (const [name, cls] of rows) {
    assert.equal(click(name), cls, name)
    assert.equal(enter(name), cls, `Return: ${name}`)
    assert.equal(space(name), cls, `Space: ${name}`)
  }
  // Named: 'Share car access' keeps the older share permission (ruled credential; it asks either way).
  assert.equal(click('Share car access'), 'permission', 'older class leads')
  for (const [name, cls] of [['Open the trunk', 'physical'], ['Turn Sentry Mode off', 'permission'], ['Add a digital key', 'credential']]) assert.deepEqual(grammarClasses(name), [cls], `table row: ${name}`)
})

test('CU-460: Sentry Mode and PIN to drive switches ask OFF, free ON; unread asks', () => {
  assert.equal(sw('Sentry Mode', native(true)), 'permission', 'Sentry on -> off')
  assert.equal(sw('Sentry Mode', native(false)), 'allow', 'Sentry off -> on')
  assert.equal(sw('PIN to Drive', native(true)), 'credential', 'PIN on -> off')
  assert.equal(sw('PIN to Drive', native(false)), 'allow', 'PIN off -> on')
  for (const checked of [true, false]) assert.equal(sw('Sentry Mode', { role: 'AXCheckBox', subrole: 'AXSwitch', checked }), 'permission', `desktop pin ${checked}`)
})

test('CU-460 negatives: the vehicle page, location, locking, closing windows, Sentry on and charging stay free', () => {
  for (const name of ['Vehicle', 'Location', 'Lock car', 'Close windows', 'Turn on Sentry Mode', 'Charging', 'Open map', 'Keys']) assert.equal(click(name), 'allow', name)
})
