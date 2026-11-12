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
  // Named over-ask (older rule): the 'pay' word asks purchase on 'Pay stubs'. 'View pay stub' is lowered by CU-429 round 4
  // (cu-coordinator 03:36Z, CU-547); 'Pay stubs' was not in the ruling and keeps its older ask.
  assert.equal(click('Pay stubs'), 'purchase', 'Pay stubs (older rule)')
  assert.equal(click('View pay stub'), 'allow', 'lowered by round 4 (03:36Z)')
})

test('CU-426 chat forms (19:25Z): bare Unsend deletes; Dismiss as admin and Export chat ask permission', () => {
  assert.equal(click('Unsend'), 'delete')
  for (const name of ['Dismiss as admin', 'Export chat']) assert.equal(click(name), 'permission', name)
  for (const name of ['Export data', 'Dismiss']) assert.equal(click(name), 'allow', name)
})

test('CU-438 (19:52Z): admin acts on another person ask permission; assigning licences asks purchase', () => {
  for (const name of ['Suspend user', 'Unsuspend user', 'Change user role', 'Make admin', 'Sign out all sessions', 'Reset sign-in cookies', 'Add alias', 'Add email alias', 'Transfer ownership']) {
    assert.equal(click(name), 'permission', name)
    assert.equal(enter(name), 'permission', `Return: ${name}`)
  }
  for (const name of ['Assign license', 'Add licenses', 'Buy licenses']) assert.equal(click(name), 'purchase', name)
  // Named: 'Remove admin' keeps the older 'remove' delete, which leads by precedence (it asks either way).
  assert.equal(click('Remove admin'), 'delete', 'older rule leads')
  for (const name of ['Users', 'User details', 'Licenses', 'Roles', 'Audit log', 'Sign out', 'Aliases']) assert.equal(click(name), 'allow', name)
})
