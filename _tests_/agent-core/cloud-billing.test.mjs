import assert from 'node:assert/strict'
import { test } from 'node:test'

import { grammarClasses } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-436 (High): enabling billing, activating a paid account, raising quota, lifting a spending cap, committing to a term and
// enabling GPUs start or lift cloud spending (purchase). Grammar table rows (cu-coordinator 19:06Z); a spending-cap switch
// turned OFF asks, ON is free on a native read. Click, Return and Space (D-106). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://cloud.example/billing'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Project', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const sw = (extra) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { name: 'Spending cap', ...extra } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-436: billing, paid accounts, quota, spending caps, commitments and GPUs ask purchase', () => {
  for (const name of ['Enable billing', 'Activate full account', 'Upgrade to paid account', 'Increase quota', 'Request quota increase', 'Turn off spending cap',
    'Remove spending limit', 'Commit to 1 year', 'Commit to 3 years', 'Enable GPU', 'Add GPU']) {
    assert.equal(click(name), 'purchase', name)
    assert.equal(enter(name), 'purchase', `Return: ${name}`)
    assert.equal(space(name), 'purchase', `Space: ${name}`)
  }
  for (const name of ['Enable billing', 'Increase quota', 'Commit to 1 year', 'Add GPU']) assert.deepEqual(grammarClasses(name), ['purchase'], `table row: ${name}`)
})

test('CU-436: a spending-cap switch turned OFF asks purchase, ON is free on a native read; an unread state asks both ways', () => {
  assert.equal(sw({ tag: 'input', inputType: 'checkbox', role: 'switch', checked: true }), 'purchase', 'on -> off lifts the cap')
  assert.equal(sw({ tag: 'input', inputType: 'checkbox', role: 'switch', checked: false }), 'allow', 'off -> on protects')
  assert.equal(sw({ tag: 'div', role: 'switch', checked: false }), 'purchase', 'ARIA state not trusted')
  assert.equal(sw({ role: 'AXCheckBox', subrole: 'AXSwitch' }), 'purchase', 'no state read')
})

test('CU-436 negatives: Billing, Usage, Quotas, Budgets, Set budget, Turn on spending cap, Cost explorer stay free', () => {
  for (const name of ['Billing', 'Usage', 'Quotas', 'Budgets', 'Set budget', 'Turn on spending cap', 'Cost explorer', 'Activate account', 'Commit changes']) assert.equal(click(name), 'allow', name)
})
