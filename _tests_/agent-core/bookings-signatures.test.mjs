import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-415 (High): bookings commit money (purchase); cancelling one is fee-bearing (delete); signatures and record releases
// bind the owner or share personal data (permission); an appointment without a price submits. Click, Return and Space
// (D-106). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://travel.example/checkout'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Name', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-415: bookings ask purchase; reserving with a price or deposit asks purchase', () => {
  for (const name of ['Book flight', 'Book hotel', 'Book room', 'Book now', 'Confirm booking', 'Complete booking', 'Reserve table $20 deposit', 'Reserve seat - $15', 'Book appointment $40']) {
    assert.equal(click(name), 'purchase', name)
    assert.equal(enter(name), 'purchase', `Return: ${name}`)
  }
})

test('CU-415: cancelling a booking asks delete; signing and releasing records ask permission; a priceless appointment submits', () => {
  for (const name of ['Cancel reservation', 'Cancel booking']) assert.equal(click(name), 'delete', name)
  for (const name of ['Sign document', 'E-sign', 'Adopt and sign', 'Sign and submit', 'Accept terms', 'Accept agreement', 'Authorize release', 'Release records', 'Share records']) {
    assert.equal(click(name), 'permission', name)
    assert.equal(space(name), 'permission', `Space: ${name}`)
  }
  for (const name of ['Book appointment', 'Reserve table', 'Reserve seat']) assert.equal(click(name), 'submit', name)
})

test('CU-415 negatives: lists, viewing and downloading, Terms and Accept cookies stay free', () => {
  for (const name of ['Bookings', 'My reservations', 'View document', 'Review document', 'Terms', 'Download PDF', 'Accept cookies']) assert.equal(click(name), 'allow', name)
})

test('CU-415: a price shown in the same form (formContext.priceShown) makes Reserve table / Book appointment a purchase, on a click and on Return', () => {
  const at = (name, priceShown) => policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name, formContext: { options: [], amountEntry: false, priceShown } } }).class
  assert.equal(at('Reserve table', true), 'purchase')
  assert.equal(at('Book appointment', true), 'purchase')
  assert.equal(at('Reserve table', false), 'submit')
  const ret = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Party size', defaultButtonRead: true, defaultButton: { role: 'button', name: 'Reserve table', formContext: { options: [], amountEntry: false, priceShown: true } } } })
  assert.equal(ret.class, 'purchase')
})
