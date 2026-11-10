import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-430 (High): travel add-ons, seat and cabin upgrades, miles and flight changes spend money or points (purchase);
// cancelling a flight cancels a trip (delete); accepting a new itinerary binds it (submit). Click, Return and Space (D-106).
// Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://airline.example/trips/ABC123'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Confirmation code', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-430: bags, insurance, seat and cabin upgrades, miles, points and flight / date changes ask purchase', () => {
  for (const name of ['Add bags', 'Add checked bag', 'Add insurance', 'Add travel insurance', 'Upgrade seat', 'Upgrade to Business', 'Upgrade to First', 'Use miles', 'Pay with points', 'Change flight', 'Change dates']) {
    assert.equal(click(name), 'purchase', name)
    assert.equal(enter(name), 'purchase', `Return: ${name}`)
    assert.equal(space(name), 'purchase', `Space: ${name}`)
  }
})

test('CU-430: cancelling a flight or trip asks delete; accepting a new itinerary or schedule change submits', () => {
  for (const name of ['Cancel flight', 'Cancel trip']) assert.equal(click(name), 'delete', name)
  for (const name of ['Accept new itinerary', 'Accept schedule change']) {
    assert.equal(click(name), 'submit', name)
    assert.equal(enter(name), 'submit', `Return: ${name}`)
  }
})

test('CU-430 negatives: info, maps, details, Manage booking, Itinerary, Decline insurance and No thanks stay free', () => {
  for (const name of ['Baggage info', 'Seat map', 'Trip details', 'Manage booking', 'Itinerary', 'Decline insurance', 'No thanks']) assert.equal(click(name), 'allow', name)
})
