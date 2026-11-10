import assert from 'node:assert/strict'
import { test } from 'node:test'

import { grammarClasses } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-434 (High): rides, deliveries and scooter / bike rentals start a paid service (purchase); cancelling a ride may charge a
// fee (submit). Built as grammar table rows (cu-coordinator 18:44Z), not a phrase list. Click, Return and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://rides.example/home'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Where to?', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-434: requesting, booking or scheduling a ride, a delivery, a reorder and unlocking or reserving a scooter / bike ask purchase', () => {
  for (const name of ['Request ride', 'Book ride', 'Schedule ride', 'Request delivery', 'Reorder', 'Order again', 'Unlock scooter', 'Unlock bike', 'Start ride', 'Reserve bike', 'Reserve scooter']) {
    assert.equal(click(name), 'purchase', name)
    assert.equal(enter(name), 'purchase', `Return: ${name}`)
    assert.equal(space(name), 'purchase', `Space: ${name}`)
  }
  assert.equal(click('Cancel ride'), 'submit', 'a cancellation fee may apply')
})

test('CU-434: the rows come from the grammar tables (module level), not a phrase list', () => {
  for (const name of ['Request a ride', 'Book the scooter', 'Schedule a delivery', 'Unlock the e-bike', 'Reserve 2 bikes']) assert.deepEqual(grammarClasses(name), ['purchase'], name)
})

test('CU-434 negatives: lists, history, estimates, pickup, destination stay free; unlocking an account or starting a meeting keep their classes', () => {
  for (const name of ['Rides', 'Ride history', 'Fare estimate', 'Set pickup', 'Choose destination', 'Order history', 'Unlock account', 'Unlock full article']) assert.equal(click(name), 'allow', name)
  assert.equal(click('Start meeting'), 'submit', 'unchanged')
  // cu-coordinator 18:49Z: 'Track order' (ruled free) asks purchase from an older phrase rule - a named over-ask for CU-429's
  // lowering family; a High never lowers an older rule.
  assert.equal(click('Track order'), 'purchase', 'named over-ask (older rule)')
})
