import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-473 Return route (cu-coordinator 04:20Z): Return in a form field submits through the form's default button; with the driver's
// defaultButton.firstLine / defaultCandidates[].firstLine, the click classifier's firstLine form (the pair, #610) judges it - the Return
// probe passes the whole default-button record, so no new policy line is needed; these rows pin it.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const NAME = 'Change Direct Deposit Takes Effect Immediately'
const enter = (extra) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: 'https://app.example/pay', target: { tag: 'input', role: 'textbox', name: 'Routing number', defaultButtonRead: true, ...extra } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-473 Return route: a Title-case two-line default button asks by its first line - as the default button or a candidate', () => {
  assert.equal(enter({ defaultButton: { role: 'button', name: NAME, firstLine: 'Change Direct Deposit' } }), 'credential')
  assert.equal(enter({ defaultCandidates: [{ role: 'button', name: NAME, firstLine: 'Change Direct Deposit' }] }), 'credential')
})

test('CU-473 Return route negatives: no field, no change; a free first line stays free', () => {
  assert.equal(enter({ defaultButton: { role: 'button', name: NAME } }), 'allow', 'without the driver field (the named limit until the driver half lands)')
  assert.equal(enter({ defaultButton: { role: 'button', name: 'Search Results Show All Matches', firstLine: 'Search Results' } }), 'allow')
})
