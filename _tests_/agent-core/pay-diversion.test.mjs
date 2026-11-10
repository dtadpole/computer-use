import assert from 'node:assert/strict'
import { test } from 'node:test'

import { grammarClasses } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-437 (High): redirecting pay or payouts (direct deposit, bank details, routing / account number, payout account or method)
// is an account takeover - credential, like the older 'Edit bank account'. CU-426's three chat forms (Medium). Grammar
// table rows. Click, Return and Space (D-106). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://hr.example/pay'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Employee ID', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-437: changing where pay or payouts go asks credential', () => {
  for (const name of ['Change direct deposit', 'Update direct deposit', 'Update bank details', 'Change bank details', 'Change deposit account',
    'Update routing number', 'Change account number', 'Change payout account', 'Update payout method', 'Add bank account']) {
    assert.equal(click(name), 'credential', name)
    assert.equal(enter(name), 'credential', `Return: ${name}`)
    assert.equal(space(name), 'credential', `Space: ${name}`)
  }
  for (const name of ['Change my direct deposit', 'Update the routing number', 'Edit payout details']) assert.deepEqual(grammarClasses(name), ['credential'], `table row: ${name}`)
})

test('CU-437 negatives: Direct deposit, Bank accounts and Payout history stay free; Pay stubs keeps an older ask (named)', () => {
  for (const name of ['Direct deposit', 'Bank accounts', 'Payout history']) assert.equal(click(name), 'allow', name)
  // Named over-ask (older rule, for CU-429's family): the 'pay' word asks purchase on 'Pay stubs' / 'View pay stub'.
  for (const name of ['Pay stubs', 'View pay stub']) assert.equal(click(name), 'purchase', `${name} (older rule)`)
})

test('CU-426 chat forms (19:25Z): bare Unsend deletes; Dismiss as admin and Export chat ask permission', () => {
  assert.equal(click('Unsend'), 'delete')
  for (const name of ['Dismiss as admin', 'Export chat']) assert.equal(click(name), 'permission', name)
  for (const name of ['Export data', 'Dismiss']) assert.equal(click(name), 'allow', name)
})
