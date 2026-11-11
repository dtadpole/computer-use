import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-433 (cu-coordinator 09:51Z): mail near forms ask as their ruled neighbours. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const MAIL = 'https://mail.example/inbox'
const at = (name, key = false) => {
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: MAIL, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: MAIL, target: { role: 'button', name } })
  return v.decision === 'allow' ? 'allow' : v.class
}

test('CU-433: recall, report phishing, empty spam, create rule, release message ask in their ruled class', () => {
  for (const [name, cls, like] of [['Recall message', 'delete', 'Unsend message'], ['Report phishing', 'submit', 'Report spam'], ['Empty spam', 'delete', 'Empty trash'],
    ['Create rule', 'credential', 'Create filter'], ['Release message', 'permission', null]]) {
    assert.equal(at(name), cls, name)
    assert.equal(at(name, true), cls, `Space: ${name}`)
    if (like) assert.equal(at(like), cls, `${like} (the ruled neighbour)`)
  }
  for (const [name, cls] of [['Recall this message', 'delete'], ['Report as phishing', 'submit'], ['Empty junk', 'delete'], ['Create a rule', 'credential'], ['Release from quarantine', 'permission']]) assert.equal(at(name), cls, name)
})

test('CU-433 negatives: views and help stay free', () => {
  for (const name of ['Rules', 'Spam', 'Phishing tips', 'Quarantine', 'Message details', 'Release notes']) assert.equal(at(name), 'allow', name)
})

test('CU-433: a bare Add rule stays free off a mail page (CU-492 pin); Add mail rule asks credential', () => {
  const p = createPolicy({ sitePolicy: () => 'allow' })
  const at = (name) => { const v = p.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/settings', target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
  assert.equal(at('Add rule'), 'allow')
  assert.equal(at('Add mail rule'), 'credential')
  assert.equal(at('Create rule'), 'credential')
})

test('#693 round 2 (cu-researcher 14:53Z): the CU-433 rows as verb families; a bare Add rule asks on a mail page only', () => {
  const p = createPolicy({ sitePolicy: () => 'allow' })
  const at = (name, url = 'https://webmail.example/settings') => { const v = p.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
  for (const [name, cls] of [['Empty Spam folder', 'delete'], ['Empty junk folder', 'delete'], ['Report phishing attempt', 'submit'], ['Report as phishing', 'submit'], ['Create new rule', 'credential'], ['New rule', 'credential'], ['Release all', 'permission'], ['Release all messages', 'permission']]) assert.equal(at(name), cls, name)
  assert.equal(at('Add rule', 'https://mail.example/settings'), 'credential', 'a mail host')
  assert.equal(at('Add rule', 'https://app.example/mail/rules'), 'credential', 'a mail path')
  assert.equal(at('Add rule', 'https://console.example/vpc/security-groups'), 'allow', 'CU-492: a cloud console')
  for (const name of ['Rules', 'Spam', 'Quarantine', 'Phishing tips']) assert.equal(at(name), 'allow', name)
})

test('#693 round 3 (cu-developer-three 14:56Z): Apple Mail\'s Add Rule asks credential; other apps keep it free', () => {
  const p = createPolicy({ sitePolicy: () => 'allow' })
  const at = (name, url) => { const v = p.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'AXButton', name } }); return v.decision === 'allow' ? 'allow' : v.class }
  assert.equal(at('Add Rule', 'app:com.apple.mail'), 'credential')
  assert.equal(at('Add Rule', 'desktop://com.microsoft.Outlook'), 'credential')
  assert.equal(at('Add Rule', 'app:com.example.firewall'), 'allow', 'CU-492: elsewhere a form opener')
})
