import assert from 'node:assert/strict'
import { test } from 'node:test'

import { grammarClasses } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-461 (High): exposing an account or a contact detail by other wordings asks permission (CU-424's closed family); the
// private-account switch asks when turned OFF; making an account private, a friends-only audience and hiding a detail are free.
// Grammar table rows. Click, Return and Space (D-106). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://social.example/settings/privacy'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Bio', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const sw = (name, extra) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { name, ...extra } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-461: public accounts and audiences, shown contact details and messages from anyone ask permission', () => {
  for (const name of ['Switch to public account', 'Make account public', 'Turn off private account', 'Change audience to Public', 'Set to Public', 'Show my phone number',
    'Show my email', 'Allow anyone to message me', 'Allow messages from everyone']) {
    assert.equal(click(name), 'permission', name)
    assert.equal(enter(name), 'permission', `Return: ${name}`)
    assert.equal(space(name), 'permission', `Space: ${name}`)
  }
  for (const name of ['Switch private account off', 'Display my phone number', 'Allow everyone to message you']) assert.deepEqual(grammarClasses(name), ['permission'], `table row: ${name}`)
})

test('CU-461: the private-account switch asks OFF, free ON; unread asks; a desktop switch asks both ways', () => {
  const native = (checked) => ({ tag: 'input', inputType: 'checkbox', role: 'switch', checked })
  assert.equal(sw('Private account', native(true)), 'permission', 'on -> off')
  assert.equal(sw('Private account', native(false)), 'allow', 'off -> on')
  assert.equal(sw('Private account', { role: 'switch', tag: 'div', checked: true }), 'permission', 'ARIA state not trusted')
  for (const checked of [true, false]) assert.equal(sw('Private account', { role: 'AXCheckBox', subrole: 'AXSwitch', checked }), 'permission', `desktop pin ${checked}`)
})

test('CU-461 negatives: privacy settings, making the account private, friends-only audiences and hiding details stay free', () => {
  for (const name of ['Privacy settings', 'Make account private', 'Make private', 'Change audience to Friends', 'Change audience to Only me', 'Hide my phone number', 'Show more', 'Show replies']) assert.equal(click(name), 'allow', name)
})
