import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-408 (High): on a payments page, confirming, authorizing, scheduling, autopay, refunds and charges move money (purchase);
// adding a payee widens who can be paid (permission). Click and Return (D-106: the click's classifier on the default
// button). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://bank.example/payments'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Amount', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }

const PURCHASE = ['Confirm payment', 'Authorize payment', 'Submit payment', 'Make payment', 'Make a payment', 'Pay now', 'Schedule payment', 'Set up autopay', 'Enable autopay', 'Turn on autopay', 'Issue refund', 'Refund', 'Charge card', 'Charge customer', 'Capture payment', 'Send invoice payment']
const PERMISSION = ['Add payee', 'Add recipient', 'Add beneficiary']
const FREE = ['Payment history', 'Payment methods', 'Payees', 'Recipients', 'Refund policy', 'View payment', 'Turn off autopay', 'Cancel scheduled payment']

test('CU-408: money-moving payment controls ask purchase on a click and on Return', () => {
  for (const name of PURCHASE) {
    assert.equal(click(name), 'purchase', name)
    assert.equal(enter(name), 'purchase', `Return: ${name}`)
  }
})

test('CU-408: adding a payee, recipient or beneficiary asks permission', () => {
  for (const name of PERMISSION) assert.equal(click(name), 'permission', name)
})

test('CU-408 negatives: history, methods, lists, policies, viewing and turning autopay off stay free', () => {
  for (const name of FREE) assert.equal(click(name), 'allow', name)
})

const toggle = (target) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { name: 'Autopay', ...target } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-408 (09:50Z): a bare Autopay switch mirrors CU-373 - native on is free, native off / ARIA / mixed / missing ask purchase', () => {
  assert.equal(toggle({ tag: 'input', inputType: 'checkbox', role: 'checkbox', checked: true }), 'allow', 'native on: the press turns it off')
  assert.equal(toggle({ tag: 'input', inputType: 'checkbox', role: 'checkbox', checked: false }), 'purchase', 'native off: the press turns it on')
  assert.equal(toggle({ tag: 'button', role: 'switch', checked: true }), 'purchase', 'ARIA-sourced on is not trusted')
  assert.equal(toggle({ tag: 'input', inputType: 'checkbox', role: 'checkbox', checked: 'mixed' }), 'purchase')
  assert.equal(toggle({ tag: 'div', role: 'switch' }), 'purchase', 'missing state asks')
  assert.equal(toggle({ tag: 'a', role: 'link' }), 'allow', 'an Autopay link or tab is navigation')
})
