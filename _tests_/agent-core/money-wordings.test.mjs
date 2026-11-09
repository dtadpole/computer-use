import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-386 (High pending a live row): money committed outside a checkout asks purchase - by click and by Return on a form's
// default button (the browser driver's CU-150 shape).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://shop.example/', target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const WORDS = ['Place bid', 'Make offer', 'Accept offer', 'Pledge', 'Top up', 'Add funds', 'Cash out', 'Place bet', 'Send tip']

test('CU-386: money-committing wordings ask purchase by click', () => {
  for (const name of WORDS) assert.equal(click(name), 'purchase', name)
})

test('CU-386: Return in a form whose default button is one of them asks purchase', () => {
  for (const name of ['Place bid', 'Add funds']) {
    const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: 'https://shop.example/', target: { tag: 'input', role: 'textbox', name: 'Amount', editable: true, defaultButton: { role: 'button', name } } })
    assert.equal(v.class, 'purchase', name)
  }
})

test('CU-386 negatives: Offers, Funds and Tips as plain labels stay free', () => {
  for (const name of ['Offers', 'My funds', 'Tips and tricks', 'Top stories']) assert.equal(click(name), 'allow', name)
})
