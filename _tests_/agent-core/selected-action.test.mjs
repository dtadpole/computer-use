import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy, selectedOptionClasses } from '../../_tools_/agent-core/policy.mjs'

// CU-371 (cu-coordinator's filing): a generic Apply / Go / Update beside a select that already holds a destructive option was
// judged by its own name and acted unasked (measured live on main, 16 Nov 12:41Z). The driver sends the form's selected option
// texts (formContext.options, CU-400); a generic, otherwise-unclassed submit is judged by them. Both sides.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://blog.example/wp-admin/posts'
const ctx = (options) => ({ options, amountEntry: false })
const press = (name, options) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { tag: 'button', role: 'button', name, ...(options ? { formContext: ctx(options) } : {}) } }); return v.decision === 'allow' ? 'allow' : (v.classes ?? [v.class]).slice().sort().join('+') }
const enter = (defaultButton) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Search posts', defaultButtonRead: true, defaultButton } }); return v.decision === 'allow' ? 'allow' : (v.classes ?? [v.class]).slice().sort().join('+') }

test('CU-371: a generic submit beside a destructive selected option asks delete', () => {
  assert.equal(press('Apply', ['Delete permanently']), 'delete')
  assert.equal(press('Apply', ['Move to Trash']), 'delete')
  assert.equal(press('Go', ['Delete selected']), 'delete')
  assert.equal(press('Update', ['Delete all']), 'delete')
  assert.equal(press('OK', ['Remove from group']), 'delete')
  assert.equal(press('Run', ['Purge cache']), 'delete')
  assert.equal(press('Apply', ['Archive permanently']), 'delete', 'archive said to be permanent')
  assert.equal(press('Apply', ['Published', 'Move to bin']), 'delete', 'any of the selected options')
})

test('CU-371: archive / move / mark and ordinary choices stay free', () => {
  for (const options of [['Edit'], ['Export CSV'], ['Archive'], ['Move to folder'], ['Mark as read'], ['Bulk actions'], ['Newest first'], ['Deleted items'], ['Trash'], ['Removed'], ['Permanent link']]) {
    assert.equal(press('Apply', options), 'allow', JSON.stringify(options))
  }
  assert.equal(press('Go', ['Empty trash']), 'delete')
  assert.equal(press('Apply'), 'allow', 'no formContext: unchanged')
})

test('CU-371: only a generic submit reads the selection; a classed or named control keeps its own reading', () => {
  assert.equal(press('Filter', ['Delete selected']), 'allow', 'a named act other than applying the selection')
  assert.equal(press('Cancel', ['Delete selected']), 'allow')
  assert.equal(press('Submit', ['Remove from group']), press('Submit'), 'Submit is classed by its own name - the late union stays out')
  assert.equal(press('Delete', ['Edit']), 'delete')
})

test('CU-371: Return presses the default button, judged as the click on it would be (CU-406)', () => {
  assert.equal(enter({ name: 'Apply', formContext: ctx(['Delete permanently']) }), 'delete')
  assert.equal(enter({ name: 'Apply', formContext: ctx(['Edit']) }), 'allow')
})

test('CU-371: selectedOptionClasses reads at most three options of 24 characters', () => {
  assert.deepEqual(selectedOptionClasses(ctx(['Delete permanently'])), ['delete'])
  assert.deepEqual(selectedOptionClasses(ctx(['a', 'b', 'c', 'Delete'])), [], 'a fourth option is never read')
  assert.deepEqual(selectedOptionClasses(ctx(['Delete ' + 'x'.repeat(20)])), [], 'over 24 characters is none (the driver drops it too)')
  assert.deepEqual(selectedOptionClasses(null), [])
  assert.deepEqual(selectedOptionClasses({ options: 'Delete' }), [])
})
