import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'
import { CARD, j } from '../fixture-shapes/shapes.mjs'

// CU-354 (High): the task's own values are exempt whole, never token by token - a task word that is only part of a value,
// or a keyword, exempts nothing.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const typed = (text, task) => { const r = policy.classify({ type: 'type', text }, { url: 'https://shop.example/pay', target: { tag: 'input', role: 'textbox', name: 'Notes', editable: true }, task }); return r.decision === 'allow' ? 'allow' : r.class }
const LAST4 = CARD.replace(/\D/g, '').slice(-4)

test('CU-354: a task naming part of a value or a keyword exempts nothing', () => {
  assert.equal(typed(CARD, `Pay with my Visa ending in ${LAST4}`), 'sensitive_data')
  assert.equal(typed(CARD, `use the card whose groups include ${CARD.split(' ')[1]}`), 'sensitive_data')
  assert.equal(typed(j('password', '=hunter2!'), 'reset my password'), 'sensitive_data')
  assert.equal(typed(j('token=', 'tk_9f8e7d6c'), 'paste the token into settings'), 'sensitive_data')
})

test('CU-354 keeps CU-8: the task\'s own whole values typed back stay allowed', () => {
  assert.equal(typed('pat@mail.example', 'email pat@mail.example the report'), 'allow')
  assert.equal(typed('+1 415 555 0100', 'call +1 415 555 0100 about the order'), 'allow')
  assert.equal(typed(CARD, `pay with card ${CARD}`), 'allow')
  assert.equal(typed('10 Downing Street', 'ship it to 10 Downing Street'), 'allow')
})
