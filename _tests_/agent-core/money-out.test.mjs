import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-413: money moved out to a bank asks purchase, as 'Withdraw to bank' does.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const cls = (n) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://wallet.fixture.example/balance', target: { role: 'button', name: n } }); return v.decision === 'allow' ? [] : (v.classes ?? [v.class]) }

test('CU-413: send / transfer / move / cash out to a bank or card asks purchase', () => {
  for (const n of ['Send to bank', 'Transfer to bank account', 'Move money to savings', 'Transfer $50 to checking', 'Cash out to debit card', 'Send balance to my bank', 'Pay out to bank']) assert.ok(cls(n).includes('purchase'), n)
})

test('CU-413: sends that move no money to a bank stay as they were', () => {
  for (const n of ['Send to Kindle', 'Send to phone', 'Move to folder', 'Bank details', 'Transfer ownership']) assert.ok(!cls(n).includes('purchase'), n)
})
