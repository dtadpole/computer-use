import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-413 (Medium; narrowed after the phrase grammar, cu-coordinator 18:40Z - the policy change is the send-to-bank phrases
// only; the other rows are regression rows the grammar and #575 now satisfy): payment setup - one-click buying, redeeming and cashing out (purchase); linking a bank, card or PayPal
// and adding a payment method (credential). Click and Return (D-106). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://shop.example/account'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Amount', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-413: one-click buying, redeeming, sending to bank and cashing out ask purchase', () => {
  for (const name of ['Turn on 1-Click', 'Enable one-click buying', 'Redeem points', 'Redeem gift card', 'Send to bank', 'Transfer to bank', 'Withdraw to bank', 'Cash out']) {
    assert.equal(click(name), 'purchase', name)
    assert.equal(enter(name), 'purchase', `Return: ${name}`)
  }
})

test('CU-413: linking PayPal, a bank or a card and adding a bank account or payment method ask credential', () => {
  for (const name of ['Link PayPal', 'Connect bank', 'Link bank', 'Add bank account', 'Link card']) {
    assert.equal(click(name), 'credential', name)
    assert.equal(enter(name), 'credential', `Return: ${name}`)
  }
})

test('CU-413 negatives: lists, balances and turning 1-Click off stay free', () => {
  for (const name of ['Payment methods', 'Bank accounts', 'Points balance', 'Gift cards', 'Turn off 1-Click']) assert.equal(click(name), 'allow', name)
})

test('CU-413 near forms (12:28Z): Redeem 500 points and Redeem rewards ask purchase; Add new payment method asks credential', () => {
  for (const name of ['Redeem 500 points', 'Redeem 1,000 points', 'Redeem rewards']) assert.equal(click(name), 'purchase', name)
  // Named (after the grammar): 'Add (new) payment method' asks purchase AND credential from the grammar's own row - purchase leads,
  // the credential class rides beside it; it asks either way.
  for (const name of ['Add payment method', 'Add new payment method']) {
    const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } })
    assert.equal(v.decision, 'confirm', name)
    assert.ok((v.classes ?? [v.class]).includes('credential'), `${name}: credential beside purchase`)
  }
  assert.equal(enter('Redeem rewards'), 'purchase', 'Return: Redeem rewards')
  for (const name of ['Rewards', 'Points history']) assert.equal(click(name), 'allow', name)
})
