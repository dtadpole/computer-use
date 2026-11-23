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
  assert.equal(click('Book appointment'), 'submit', 'an appointment without a price submits')
  for (const name of ['Reserve table', 'Reserve seat', 'Reserve a table']) assert.equal(click(name), 'purchase', `${name} (13:12Z: unconditional)`)
})

test('CU-415 negatives: lists, viewing and downloading, Terms and Accept cookies stay free', () => {
  for (const name of ['Bookings', 'My reservations', 'View document', 'Review document', 'Terms', 'Download PDF', 'Accept cookies']) assert.equal(click(name), 'allow', name)
})


test('CU-415 round 3 (13:19Z): Sign agreement/contract and Release my records ask permission; Book tickets/car/trip and Confirm reservation purchase; Cancel trip/appointment delete', () => {
  for (const name of ['Sign agreement', 'Sign contract', 'Release my records']) assert.equal(click(name), 'permission', name)
  for (const name of ['Book tickets', 'Book car', 'Book trip', 'Confirm reservation']) {
    assert.equal(click(name), 'purchase', name)
    assert.equal(enter(name), 'purchase', `Return: ${name}`)
  }
  for (const name of ['Cancel trip', 'Cancel appointment']) assert.equal(click(name), 'delete', name)
})

test('CU-415 named limit (13:19Z): I agree, Agree and continue, Accept & continue stay free; bare Sign / Sign here ask permission since CU-495 (11:06Z, a raise)', () => {
  for (const name of ['I agree', 'Agree and continue', 'Accept & continue']) assert.equal(click(name), 'allow', name)
  for (const name of ['Sign', 'Sign here']) assert.equal(click(name), 'permission', name)
})
