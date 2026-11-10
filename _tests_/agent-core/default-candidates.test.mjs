import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-412 (High): Return's implicit submission past role=button controls. One control is the defaultButton (D-106, the
// click classifier); two or three are defaultCandidates - each judged and every class asked, the strictest leading (fail
// closed); more than three ask unknown. A real <button> path and a search form with no control stay as they are.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://app.example/settings'
const enter = (extra) => policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Confirm', defaultButtonRead: true, ...extra } })

test('CU-412: one role=button div as the default asks its class on Return', () => {
  assert.equal(enter({ defaultButton: { role: 'button', name: 'Delete account' } }).class, 'delete')
  assert.equal(enter({ defaultButton: { role: 'button', name: 'Buy now' } }).class, 'purchase')
})

test('CU-412: two or three candidates ask the strictest of their classes', () => {
  const two = enter({ defaultCandidates: [{ role: 'button', name: 'Save draft' }, { role: 'button', name: 'Delete account' }] })
  assert.equal(two.class, 'delete')
  const three = enter({ defaultCandidates: [{ role: 'button', name: 'Change email' }, { role: 'button', name: 'Buy now' }, { role: 'button', name: 'Cancel' }] })
  assert.equal(three.class, 'purchase')
  assert.ok(three.classes.includes('credential'), 'every candidate class is listed')
})

test('CU-412: more than three candidates ask unknown; a search form with no control and harmless candidates stay free', () => {
  assert.equal(enter({ defaultCandidatesMore: true }).class, 'unknown_target')
  assert.equal(enter({}).decision, 'allow')
  assert.equal(enter({ defaultCandidates: [{ role: 'button', name: 'Search' }, { role: 'button', name: 'Clear' }] }).decision, 'allow')
})

test('CU-412 union (11:35Z): candidates beside a hidden or nameless default are judged too - a hidden Submit + a Delete account div asks delete', () => {
  const v = enter({ defaultButton: { role: 'button', name: 'Submit' }, defaultCandidates: [{ role: 'button', name: 'Delete account' }] })
  assert.equal(v.class, 'delete')
  assert.ok(v.classes.includes('submit'), 'the default keeps its own class beside')
  assert.equal(enter({ defaultButton: { role: 'button', name: 'Search' }, defaultCandidatesMore: true }).class, 'unknown_target', 'more than three beside a harmless default asks unknown')
  assert.equal(enter({ defaultButton: { role: 'button', name: 'Buy now' }, defaultCandidatesMore: true }).class, 'purchase', 'a default that asks keeps its class')
})

test('CU-412 (cu-researcher 11:54Z): a nameless candidate is unreadable and asks unknown - it never drops out', () => {
  assert.equal(enter({ defaultCandidates: [{ role: 'button', name: 'Cancel' }, { role: 'AXButton', name: null }] }).class, 'unknown_target')
  assert.equal(enter({ defaultCandidates: [{ role: 'button', name: 'Cancel' }, { role: 'button', name: '  ' }] }).class, 'unknown_target')
  assert.equal(enter({ defaultCandidates: [{ role: 'button', name: 'Delete account' }, { role: 'button', name: '' }] }).class, 'delete', 'a named risky candidate still leads')
})
