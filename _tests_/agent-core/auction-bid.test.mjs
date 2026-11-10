import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// Parity sweep (cu-coordinator 08:24Z): an auction bid commits money - bare 'Bid' and 'Bid now' ask purchase, on a click
// and on Return through the default button (CU-406's click classifier); 'Bid history' and 'Bids' stay free.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://auction.example/item/1', target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: 'https://auction.example/item/1', target: { tag: 'input', role: 'textbox', name: 'Your bid', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }

test('auction: Bid and Bid now ask purchase on a click and on Return', () => {
  for (const name of ['Bid', 'Bid now', 'bid now']) {
    assert.equal(click(name), 'purchase', name)
    assert.equal(enter(name), 'purchase', `Return: ${name}`)
  }
})

test('auction negatives: Bid history, Bids and a bidder profile stay free', () => {
  for (const name of ['Bid history', 'Bids', 'Bidder profile', 'Forbid']) assert.equal(click(name), 'allow', name)
})
