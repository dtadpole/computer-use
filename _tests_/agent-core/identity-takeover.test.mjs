import assert from 'node:assert/strict'
import { test } from 'node:test'

import { grammarClasses } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-453 (High): the identity-takeover path - changing a mailing address or contact info, forwarding mail, changing a phone
// number and lifting a credit freeze ask credential; certifying or filing a benefit claim asks submit. Grammar table rows.
// Click, Return and Space (D-106). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://account.example/profile'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'ZIP', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-453: address, contact, mail forwarding, phone and credit-freeze changes ask credential; benefit claims submit', () => {
  const rows = [['Change mailing address', 'credential'], ['Update address', 'credential'], ['Forward mail', 'credential'], ['Update contact info', 'credential'],
    ['Change phone number', 'credential'], ['Unfreeze credit', 'credential'], ['Lift credit freeze', 'credential'], ['Temporarily lift freeze', 'credential'],
    ['Certify weekly claim', 'submit'], ['File claim', 'submit'], ['Submit claim', 'submit']]
  for (const [name, cls] of rows) {
    assert.equal(click(name), cls, name)
    assert.equal(enter(name), cls, `Return: ${name}`)
    assert.equal(space(name), cls, `Space: ${name}`)
  }
  for (const [name, cls] of [['Change my home address', 'credential'], ['Remove the freeze', 'credential'], ['Certify my claim', 'submit']]) assert.deepEqual(grammarClasses(name), [cls], `table row: ${name}`)
})

test('CU-453 negatives: profile, addresses, freezing credit, the credit report and claim status stay free', () => {
  for (const name of ['Profile', 'Addresses', 'Freeze credit', 'Credit report', 'Claim status', 'Add address', 'Forward']) assert.equal(click(name), 'allow', name)
})
