import assert from 'node:assert/strict'
import { test } from 'node:test'

import { grammarClasses } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-440 (High): switching off a protection on a child's account asks permission - parental controls, Screen Time on the web,
// content filters, SafeSearch, explicit content, purchases, extra time; a protection switch turned OFF asks, ON is free on a
// native read. macOS System Settings stays excluded (os_security). Grammar table rows. Click, Return, Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://family.example/settings'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Child name', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const sw = (name, extra) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { name, ...extra } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-440: turning child protections off, allowing explicit content or purchases and extending time ask permission', () => {
  for (const name of ['Turn off parental controls', 'Disable parental controls', 'Turn off Screen Time', 'Disable content filter', 'Turn off SafeSearch',
    'Allow explicit content', 'Allow mature content', 'Allow purchases', 'Allow in-app purchases', 'Extend time', 'Add more time']) {
    assert.equal(click(name), 'permission', name)
    assert.equal(enter(name), 'permission', `Return: ${name}`)
    assert.equal(space(name), 'permission', `Space: ${name}`)
  }
  for (const name of ['Switch off the content filter', 'Pause parental controls', 'Add 30 minutes of screen time']) assert.ok(grammarClasses(name).length === 0 || grammarClasses(name)[0] === 'permission', name)
  assert.deepEqual(grammarClasses('Switch off the content filter'), ['permission'])
  // Named: 'Approve request' keeps the older submit ask (it asks either way; the family-page context is not read).
  assert.equal(click('Approve request'), 'submit', 'older class leads')
})

test('CU-440: a protection switch turned OFF asks permission, ON is free on a native read; an unread state asks both ways', () => {
  for (const name of ['Parental controls', 'Content filter', 'SafeSearch', 'Screen Time']) {
    assert.equal(sw(name, { tag: 'input', inputType: 'checkbox', role: 'switch', checked: true }), 'permission', `${name} on -> off`)
    assert.equal(sw(name, { tag: 'input', inputType: 'checkbox', role: 'switch', checked: false }), 'allow', `${name} off -> on`)
    assert.equal(sw(name, { tag: 'div', role: 'switch', checked: false }), 'permission', `${name} ARIA`)
  }
  // Named: 'Purchase approval' and 'Ask to Buy' keep the older purchase words' ask in both directions (they ask either way).
  for (const name of ['Purchase approval', 'Ask to Buy']) for (const checked of [true, false]) assert.equal(sw(name, { tag: 'input', inputType: 'checkbox', role: 'switch', checked }), 'purchase', `${name}: older rule, checked ${checked}`)
})

test('CU-440 negatives: family settings, reports and turning protections on stay free', () => {
  for (const name of ['Family settings', 'Screen time report', 'Turn on SafeSearch', 'Turn on parental controls', 'Allow cookies', 'Extend trial', 'Add time zone', 'Turn off notifications']) assert.equal(click(name), 'allow', name)
  // F2 guard (20:28Z): the grammar's own 'Decline request' ask is cancelled; the older asks keep asking.
  for (const name of ['Decline request', 'Deny request', 'Reject request', 'Decline']) assert.equal(click(name), 'allow', name)
  assert.deepEqual(grammarClasses('Decline request'), [])
  assert.notEqual(click('Decline offer'), 'allow', 'CU-422 keeps asking')
  assert.notEqual(click('Decline invitation'), 'allow', 'older rule keeps asking')
})
