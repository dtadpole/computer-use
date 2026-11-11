import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-487 (High; cu-coordinator 07:36Z): payroll compensation acts ask in their ruled class. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://payroll.example/people/42'
const at = (name, key = false) => {
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } })
  return v.decision === 'allow' ? 'allow' : v.class
}

test('CU-487: bonuses, raises, salary changes and employee-data exports ask in their ruled class', () => {
  for (const [name, cls] of [['Issue bonus', 'purchase'], ['Pay bonus', 'purchase'], ['Run off-cycle payroll', 'purchase'], ['Give raise', 'submit'], ['Change salary', 'submit'],
    ['Update compensation', 'submit'], ['Export employee data', 'permission'], ['Download W-2s', 'permission']]) {
    assert.equal(at(name), cls, name)
    assert.equal(at(name, true), cls, `Space: ${name}`)
  }
  // Named (older classes kept; each asks either way): 'Change pay rate' and 'Download all pay stubs' keep the older purchase (ruled
  // submit / permission); 'Pay history' asks purchase on main (an older over-ask, ruled free - CU-429).
  assert.equal(at('Change pay rate'), 'purchase')
  assert.equal(at('Download all pay stubs'), 'purchase')
  assert.equal(at('Pay history'), 'purchase')
})

test('CU-487 negatives: compensation views stay free', () => {
  for (const name of ['Compensation', 'Employees', 'Salary bands', 'Bonus policy']) assert.equal(at(name), 'allow', name)
})
