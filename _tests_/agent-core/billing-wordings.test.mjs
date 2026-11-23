import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-410 (High): billing wordings one word from the asking ones charge too (purchase). Click and Return (D-106). Both
// sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://app.example/billing'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Seats', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-410: rent, seats, licenses, credits, resume/reactivate, auto-renew on, plan switch, gifts, tickets and bare Renew ask purchase', () => {
  for (const name of ['Rent', 'Rent now', 'Rent movie', 'Rent Dune', 'Add seats', 'Add licenses', 'Add credits', 'Top up credits', 'Resume subscription', 'Reactivate', 'Reactivate subscription', 'Reactivate membership', 'Turn on auto-renew', 'Enable auto-renew', 'Switch to annual', 'Switch to yearly', 'Switch to monthly', 'Upgrade seats', 'Gift a subscription', 'Send gift', 'Get tickets', 'Renew']) {
    assert.equal(click(name), 'purchase', name)
    assert.equal(enter(name), 'purchase', `Return: ${name}`)
  }
})

test('CU-410 negatives: lists, labels, history and turning auto-renew off stay free', () => {
  for (const name of ['Seats', 'Credits', 'Licenses', 'Billing history', 'Auto-renew', 'Turn off auto-renew', 'Rentals', 'Tickets', 'Gift card balance', 'Renewal date']) assert.equal(click(name), 'allow', name)
})
