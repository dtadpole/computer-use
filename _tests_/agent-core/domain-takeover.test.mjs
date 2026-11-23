import assert from 'node:assert/strict'
import { test } from 'node:test'

import { grammarClasses } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-446 (High): the domain-takeover path - unlocking, transfer lock off, auth / EPP codes, registrant or owner change and push
// ask credential; nameservers, DNS records and WHOIS privacy off ask permission; lock / privacy switches turned OFF ask. Grammar
// table rows. Click, Return, Space (D-106). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://registrar.example/domains/example-org'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Domain', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const sw = (name, extra) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { name, ...extra } }); return v.decision === 'allow' ? 'allow' : v.class }
const native = (checked) => ({ tag: 'input', inputType: 'checkbox', role: 'switch', checked })

test('CU-446: domain unlock, transfer lock off, auth codes, registrant / owner change and push ask credential; DNS changes and WHOIS privacy off ask permission', () => {
  const rows = [['Unlock domain', 'credential'], ['Turn off domain lock', 'credential'], ['Disable transfer lock', 'credential'], ['Get auth code', 'credential'],
    ['Get EPP code', 'credential'], ['Show authorization code', 'credential'], ['Change registrant', 'credential'], ['Change account owner', 'credential'],
    ['Push domain', 'credential'], ['Change nameservers', 'permission'], ['Use custom nameservers', 'permission'], ['Edit DNS records', 'permission'],
    ['Disable WHOIS privacy', 'permission']]
  for (const [name, cls] of rows) {
    assert.equal(click(name), cls, name)
    assert.equal(enter(name), cls, `Return: ${name}`)
    assert.equal(space(name), cls, `Space: ${name}`)
  }
  for (const [name, cls] of [['Unlock this domain', 'credential'], ['Request the EPP code', 'credential'], ['Set custom nameservers', 'permission']]) assert.deepEqual(grammarClasses(name), [cls], `table row: ${name}`)
  for (const name of ['Transfer money', 'Transfer $20']) assert.equal(click(name), 'purchase', `${name} keeps purchase`)
})

test('CU-446: lock switches OFF ask credential, WHOIS privacy OFF asks permission, ON free; unread asks both ways', () => {
  for (const name of ['Domain lock', 'Transfer lock']) {
    assert.equal(sw(name, native(true)), 'credential', `${name} on -> off`)
    assert.equal(sw(name, native(false)), 'allow', `${name} off -> on`)
    assert.equal(sw(name, { tag: 'div', role: 'switch', checked: false }), 'credential', `${name} ARIA`)
  }
  assert.equal(sw('WHOIS privacy', native(true)), 'permission')
  assert.equal(sw('WHOIS privacy', native(false)), 'allow')
})

test('CU-446 negatives: domains, DNS view, locking and renewal settings stay free', () => {
  for (const name of ['Domains', 'DNS', 'Lock domain', 'Turn on domain lock', 'Renewal settings']) assert.equal(click(name), 'allow', name)
})
