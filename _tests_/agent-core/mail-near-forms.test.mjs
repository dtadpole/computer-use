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
