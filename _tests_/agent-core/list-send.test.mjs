import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-479 (High rows; cu-coordinator 04:20Z): 'Resubscribe all' and a bare 'Blast' send to people who opted out or to the whole list
// (submit). Click and Space (D-106). Imports and exports belong to CU-462 (Medium).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://mail.example/campaigns/new'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-479: Resubscribe all and a bare Blast ask submit', () => {
  for (const name of ['Resubscribe all', 'Resubscribe all contacts', 'Blast']) {
    assert.equal(click(name), 'submit', name)
    assert.equal(space(name), 'submit', `Space: ${name}`)
  }
})

test('CU-479 negatives: one resubscribe, blast lists and views stay free', () => {
  for (const name of ['Resubscribe', 'Blasts', 'Blast list', 'Campaigns']) assert.equal(click(name), 'allow', name)
})
