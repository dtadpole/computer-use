import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-416 (High): admin consoles move other people's money (purchase), act as other users (permission) and end employment
// or access (delete). Click, Return and Space (D-106). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://admin.example/console'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Note', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-416: payroll, payments, refunds, cards and credit limits ask purchase', () => {
  for (const name of ['Run payroll', 'Release payment', 'Send payment', 'Approve payment run', 'Process refund', 'Issue card', 'Raise credit limit', 'Increase credit limit', 'Pay invoice']) {
    assert.equal(click(name), 'purchase', name)
    assert.equal(enter(name), 'purchase', `Return: ${name}`)
  }
})

test('CU-416: impersonation asks permission; termination and offboarding ask delete', () => {
  for (const name of ['Impersonate user', 'Log in as user', 'Sign in as', 'Sign in as Jane Doe', 'View as user']) {
    assert.equal(click(name), 'permission', name)
    assert.equal(space(name), 'permission', `Space: ${name}`)
  }
  for (const name of ['Terminate employee', 'Offboard user', 'Deactivate employee']) assert.equal(click(name), 'delete', name)
})

test('CU-416 negatives: lists, history and signing in as a guest stay free', () => {
  for (const name of ['Payroll', 'Payments', 'Employees', 'Cards', 'Credit limits', 'Users', 'Payment history', 'Sign in as guest']) assert.equal(click(name), 'allow', name)
})

test('CU-416 near forms (13:43Z): plurals and synonyms ask purchase; Send payments / Approve payment purchase; Login as / Act as user permission', () => {
  for (const name of ['Release payments', 'Process refunds', 'Run payrolls', 'Process payroll', 'Refund customer', 'Raise limit', 'Increase spending limit', 'Issue virtual card', 'Reimburse', 'Send payments', 'Approve payment']) {
    assert.equal(click(name), 'purchase', name)
    assert.equal(enter(name), 'purchase', `Return: ${name}`)
  }
  for (const name of ['Login as user', 'Act as user', 'Act as Jane']) assert.equal(click(name), 'permission', name)
  for (const name of ['Login as guest', 'Act as a guest', 'Reimbursements', 'Spending limits']) assert.equal(click(name), 'allow', name)
})
