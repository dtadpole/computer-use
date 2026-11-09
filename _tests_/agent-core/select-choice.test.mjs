import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-370 (design note 0.1; cu-verifier reproduced it live: 'Delete' typed into a focused 'Bulk actions' <select>
// deleted the rows): a select is a choice, not a text entry, and the option a key lands on is judged like a click on it.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const BULK = { tag: 'select', role: 'combobox', name: 'Bulk actions', editable: false }
const judge = (action, target, extra = {}) => { const v = policy.classify(action, { url: 'https://shop.example/orders', target, ...extra }); return v.decision === 'allow' ? 'allow' : `${v.class}/${v.rule}` }

test('CU-370: type-ahead into a select is judged by the option it names; a partial name or key still asks as a page shortcut', () => {
  assert.equal(judge({ type: 'type', text: 'Delete' }, BULK), 'delete/class:delete', "the live row: 'Delete' typed into the select")
  assert.equal(judge({ type: 'type', text: 'Del' }, BULK), 'permission/page:shortcut', 'a prefix the policy cannot resolve still asks')
  assert.equal(judge({ type: 'keypress', keys: ['D'] }, BULK), 'permission/page:shortcut')
})

test("CU-370: the driver's keyTarget (the option a key lands on) is judged like a click on that option", () => {
  assert.equal(judge({ type: 'keypress', keys: ['ENTER'] }, { role: 'listbox', name: 'Actions' }, { keyTarget: { role: 'option', name: 'Delete' } }), 'delete/class:delete', 'an ARIA listbox Enter on an active Delete')
  assert.equal(judge({ type: 'keypress', keys: ['ARROWDOWN'] }, BULK, { keyTarget: { role: 'option', name: 'Buy now' } }), 'purchase/class:purchase')
})

test('CU-370 negatives and named over-ask: an editable combobox is text entry; a harmless option name asks once as a shortcut', () => {
  assert.equal(judge({ type: 'type', text: 'Delete' }, { role: 'combobox', name: 'Search', editable: true }), 'allow', 'an editable combobox takes text')
  assert.equal(judge({ type: 'type', text: 'Newest' }, { tag: 'select', role: 'combobox', name: 'Sort', editable: false }), 'permission/page:shortcut', "named over-ask: 'Newest' into a sort select")
  assert.equal(judge({ type: 'keypress', keys: ['ARROWDOWN'] }, BULK, { keyTarget: { role: 'option', name: 'Archive' } }), 'allow', 'a harmless option')
})
