import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-490 (High; cu-coordinator 09:51Z): a ride-share booking commit asks purchase. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const RIDE = 'https://rides.example/ride/new'
const at = (name, url = RIDE, key = false) => {
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? 'allow' : v.class
}

test('CU-490: on a ride page Confirm pickup / Confirm <product> / Request <product> ask purchase', () => {
  for (const name of ['Confirm pickup', 'Request UberX', 'Confirm UberX', 'Confirm Comfort', 'Request Lyft XL']) {
    assert.equal(at(name), 'purchase', name)
    assert.equal(at(name, RIDE, true), 'purchase', `Space: ${name}`)
  }
  for (const url of ['https://app.example/trip/42', 'https://food.example/book', 'https://x.example/request?step=2']) assert.equal(at('Confirm pickup', url), 'purchase', url)
})

test('CU-490: Confirm ride, Book ride, Request ride ask anywhere', () => {
  for (const name of ['Confirm ride', 'Book ride', 'Request ride']) assert.equal(at(name, 'https://app.example/home'), 'purchase', name)
})

test('CU-490 negatives: off a ride page, the free ride steps, and other confirms keep their class', () => {
  assert.equal(at('Confirm pickup', 'https://app.example/home'), 'allow', 'off a ride URL')
  assert.equal(at('Request UberX', 'https://app.example/booking-help'), 'allow', 'a /booking-help segment is not /book')
  for (const name of ['Set pickup', 'Choose ride', 'Fare estimate', 'Schedule']) assert.equal(at(name), 'allow', name)
  for (const name of ['Confirm email', 'Request a refund', 'Request help']) assert.equal(at(name), at(name, 'https://app.example/home'), name)
})
