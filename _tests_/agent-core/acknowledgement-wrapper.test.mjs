import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-503: 'I understand, <row>' and its kin are judged as the row. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const at = (name, key = false) => {
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: 'https://code.example/settings', target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://code.example/settings', target: { role: 'button', name } })
  return v.decision === 'allow' ? 'allow' : v.class
}

test('CU-503: an acknowledgement before a ruled row asks in the row\'s class', () => {
  for (const row of ['Make this repository public', 'Delete this repository', 'Transfer ownership', 'Disable two-factor authentication']) {
    const bare = at(row)
    assert.notEqual(bare, 'allow', `the bare row asks: ${row}`)
    for (const lead of ['I understand, ', 'I understand the consequences, ', 'I acknowledge the risk, ', 'Understood, ', "I've read and understand, "]) {
      assert.equal(at(lead + row), bare, lead + row)
      assert.equal(at(lead + row, true), bare, `Space: ${lead}${row}`)
    }
  }
})

test('CU-503 negatives: a bare acknowledgement and a benign row stay free', () => {
  for (const name of ['I understand', 'Understood', 'I understand, continue', 'I agree, close']) assert.equal(at(name), 'allow', name)
})

test('#685 round 2 (cu-researcher 13:54Z): the connector form is judged as the row', () => {
  for (const row of ['link a device', 'make this repository public']) {
    const bare = at(row.charAt(0).toUpperCase() + row.slice(1))
    for (const lead of ['I understand and want to ', 'I understand the risks and still want to ', 'I acknowledge and wish to ']) assert.equal(at(lead + row), bare, lead + row)
  }
  assert.equal(at('I understand and want to continue'), 'allow')
})

test('#685 round 3 (cu-developer-three 13:57Z): the connector keeps the row\'s trailing words (Gatekeeper)', () => {
  const desk = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'desktop://com.apple.systempreferences', target: { role: 'AXButton', name } }); return v.decision === 'allow' ? 'allow' : v.class }
  for (const name of ['I understand and want to open anyway', 'I understand and still wish to open anyway', 'I understand and want to install anyway']) assert.equal(desk(name), desk(name.replace(/^.*?to /, '')), name)
  assert.notEqual(desk('I understand and want to open anyway'), 'allow')
  assert.equal(desk('I understand and want to continue'), 'allow')
})
