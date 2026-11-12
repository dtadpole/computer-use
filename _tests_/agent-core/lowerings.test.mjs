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

test('CU-429 (cu-coordinator 13:04Z): an exchange\'s Order book is a view - free; Deactivate withdrawal lock keeps its ask', () => {
  const p = createPolicy({ sitePolicy: () => 'allow' })
  const at = (name) => { const v = p.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://exchange.example/markets', target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
  assert.equal(at('Order book'), 'allow')
  assert.notEqual(at('Deactivate withdrawal lock'), 'allow')
  assert.equal(at('Place order'), 'purchase', 'the order row itself stays')
})

test('CU-429 round 2 (cu-coordinator 17:21Z): exactly the ruled names lower; the KEEP list still asks', () => {
  const p = createPolicy({ sitePolicy: () => 'allow' })
  const at = (name, role = 'button') => { const v = p.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/x', target: { role, name } }); return v.decision === 'allow' ? 'allow' : v.class }
  for (const name of ['Go to your account', 'Back to this project', 'Open in this window', 'View API docs', 'Clear all filters', 'Rent is due', 'Note: Rent is due', 'Find and Replace\u2026', 'Find and Replace...', 'Search and replace', 'Unmute all', 'Open All Windows', 'Privacy and security', 'Uninstall guide', 'Edit draft post', 'Pay slip preview', 'Raise a support ticket']) assert.equal(at(name), 'allow', name)
  for (const name of ['Sign up', 'Remove recovery contact', 'Remove location from posts', 'Remove address', 'Quit all apps', 'Close on all devices']) assert.notEqual(at(name), 'allow', `kept: ${name}`)
  assert.notEqual(at('Open in this window', 'switch'), 'allow', 'never on a toggle')
})

test('CU-429 round 3 (cu-coordinator 21:36Z): exactly the ruled names lower; their neighbours keep asking', () => {
  const p = createPolicy({ sitePolicy: () => 'allow' })
  const at = (name, url, role = 'button') => { const v = p.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role, name } }); return v.decision === 'allow' ? 'allow' : v.class }
  assert.equal(at('View order', 'https://shop.example/orders'), 'allow')
  assert.equal(at('Security checkup', 'https://account.example/security'), 'allow')
  assert.equal(at('Security checkup', 'https://account.example/security', 'link'), 'allow')
  assert.equal(at('Call forwarding', 'https://carrier.example/account'), 'allow')
  assert.notEqual(at('Call forwarding', 'https://carrier.example/account', 'switch'), 'allow', 'the switch keeps its direction rule')
  for (const url of ['https://chat.example/c/general', 'https://app.slack.example/client/T1']) for (const name of ['Add member to group', 'Add members to group']) assert.equal(at(name, url), 'allow', `${url}: ${name}`)
  assert.notEqual(at('Add member to group', 'https://acme.okta.example/admin/groups/1'), 'allow', 'an IdP page keeps asking')
  for (const name of ['Place order', 'Security settings', 'Call forwarding settings']) assert.notEqual(at(name, 'https://example.com/x'), 'allow', `kept: ${name}`)
})
