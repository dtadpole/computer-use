import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-473 pair (cu-coordinator 02:35Z): the driver's target.firstLine is tried as one more canonical form, last and additive - the
// Title-case two-line card, a digit subtitle and a Title-Case object over a sentence-case subtitle, which the name alone cannot split.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name, firstLine) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://app.example/pay', target: { role: 'button', name, ...(firstLine ? { firstLine } : {}) } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-473 pair: a card whose first line is a ruled row asks as the row does', () => {
  for (const [name, firstLine, row] of [['Change Direct Deposit Takes Effect Immediately', 'Change Direct Deposit', 'Change direct deposit'], ['Add phone key 2 devices', 'Add phone key', 'Add phone key'],
    ['Turn off Screen Time Takes effect immediately', 'Turn off Screen Time', 'Turn off Screen Time']]) {
    const want = click(row)
    assert.notEqual(want, 'allow', `${row} asks`)
    assert.equal(click(name, firstLine), want, name)
    assert.equal(click(name), click(name), 'deterministic without the field')
  }
})

test('CU-473 pair negatives: a free first line stays free; a name that asks keeps its class; no field, no change', () => {
  assert.equal(click('Settings Manage Your Account', 'Settings'), 'allow')
  assert.equal(click('Inbox 3 New Messages', 'Inbox'), 'allow')
  assert.equal(click('Delete account Permanently', 'Delete account'), click('Delete account Permanently'), 'the name already asks')
})
