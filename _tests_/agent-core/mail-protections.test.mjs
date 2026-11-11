import assert from 'node:assert/strict'
import { test } from 'node:test'

import { grammarClasses } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-456 (High): turning a mail or account protection off asks permission (CU-373 family); turning less secure app access on
// asks credential; the switches ask in the unsafe direction. Grammar table rows. Click, Return and Space (D-106). Both sides.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://mail.example/settings'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Search settings', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const sw = (name, extra) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { name, ...extra } }); return v.decision === 'allow' ? 'allow' : v.class }
const native = (checked) => ({ tag: 'input', inputType: 'checkbox', role: 'switch', checked })

test('CU-456: mail protections off ask permission; less secure app access on asks credential', () => {
  const rows = [['Turn off spam filter', 'permission'], ['Disable spam filter', 'permission'], ['Turn off Safe Browsing', 'permission'], ['Turn off external sender warning', 'permission'],
    ['Disable sign-in notifications', 'permission'], ['Turn off security alerts', 'permission'], ['Allow all senders', 'permission'], ['Add domain to safe senders', 'permission'],
    ['Turn on less secure app access', 'credential']]
  for (const [name, cls] of rows) {
    assert.equal(click(name), cls, name)
    assert.equal(enter(name), cls, `Return: ${name}`)
    assert.equal(space(name), cls, `Space: ${name}`)
  }
  // Named: 'Allow less secure apps' keeps the older permission (it asks either way; ruled credential).
  assert.equal(click('Allow less secure apps'), 'permission', 'older class leads')
  for (const [name, cls] of [['Turn the spam filter off', 'permission'], ['Enable less secure apps', 'credential']]) assert.deepEqual(grammarClasses(name), [cls], `table row: ${name}`)
})

test('CU-456: protection switches OFF ask permission, less secure app access ON asks credential; unread asks both ways', () => {
  for (const name of ['Spam filter', 'Safe Browsing', 'External sender warning']) {
    assert.equal(sw(name, native(true)), 'permission', `${name} on -> off`)
    assert.equal(sw(name, native(false)), 'allow', `${name} off -> on`)
  }
  assert.equal(sw('Less secure app access', native(false)), 'credential', 'off -> on')
  assert.equal(sw('Less secure app access', native(true)), 'allow', 'on -> off')
  for (const checked of [true, false]) assert.equal(sw('Spam filter', { role: 'AXCheckBox', subrole: 'AXSwitch', checked }), 'permission', `desktop pin ${checked}`)
})

test('CU-456 negatives: the spam folder, turning the filter on, blocking a sender and a single safe sender stay free; Security settings keeps an older ask', () => {
  for (const name of ['Spam', 'Turn on spam filter', 'Block sender']) assert.equal(click(name), 'allow', name)
  // cu-coordinator 17:36Z (CU-511): one safe sender now asks permission - an explicit raise of the 01:36Z free pin.
  assert.equal(click('Add to safe senders'), 'permission', 'raised by CU-511 (17:36Z)')
  assert.equal(click('Security settings'), 'permission', 'older security word (CU-429)')
})
