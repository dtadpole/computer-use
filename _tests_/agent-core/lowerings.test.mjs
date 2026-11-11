import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-429 (cu-coordinator 09:34Z): the ruled older over-asks are lowered to free - exactly this list; everything else keeps its class.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://app.example/settings'
const at = (name, role = 'button', extra = {}) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role, name, ...extra } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-429 (A, C, E, G): pane names, help links, views, Edit post, Raise a ticket, Require multi-factor authentication are free', () => {
  for (const name of ['Security', 'Privacy & Security', 'Uninstall instructions', 'Pay history', 'Pay stub preview', 'View pay rate', 'Edit post', 'Raise a ticket', 'Raise ticket', 'Require multi-factor authentication']) {
    assert.equal(at(name), 'allow', name)
    assert.equal(space(name), 'allow', `Space: ${name}`)
  }
  assert.equal(at('Unsubscribe link', 'link'), 'allow', 'an Unsubscribe link')
  assert.notEqual(at('Unsubscribe'), 'allow', 'a button Unsubscribe keeps submit')
})

test('CU-429 (D): refusals are free when what follows is itself a ruled ask', () => {
  for (const name of ["Don't turn off 2FA", 'Do not disable 2FA', 'Keep 2FA on', 'No, keep two-factor authentication', "No, don't remove", "I don't want to delete my account"]) assert.equal(at(name), 'allow', name)
})

test('CU-429 kept: the ruled keeps, safeguard suppressors, second clauses and toggles keep their class', () => {
  for (const name of ['Move to Trash', 'Delete download', 'Deactivate plugin', 'Update post', 'Check out']) assert.notEqual(at(name), 'allow', name)
  for (const name of ['No, delete my account', 'No thanks, remove 2FA', 'No, remove it', 'Do not cancel - pay now', 'No, I want to delete my account', 'Never ask again and delete']) assert.notEqual(at(name), 'allow', name)
  for (const name of ["Don't ask again", "Don't show this again", "Don't warn me", "Don't notify me", "Don't confirm"]) {
    const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } })
    assert.notEqual(v.rule, 'cu429:lowered', name)
  }
  // A toggle's label names a state: a checked 'Keep 2FA on' switch, pressed, turns 2FA off (cu-developer-three 09:35Z).
  const sw = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { tag: 'input', inputType: 'checkbox', role: 'switch', name: 'Keep 2FA on', checked: true } })
  assert.notEqual(sw.rule, 'cu429:lowered')
})
