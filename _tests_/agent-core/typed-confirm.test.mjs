import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy, typedConfirmClasses } from '../../_tools_/agent-core/policy.mjs'

// CU-585 (cu-researcher's filing, reproduced by cu-verifier): in an inline danger-zone form ('Type DELETE to confirm' and a
// bare 'Confirm'), Return asked delete but a click on the bare submit acted unasked. The driver now sends the form's
// text-entry words (formEntries, #884); a bare, otherwise-unclassed submit reads them by sense. Both sides.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://code.example/org/repo/settings'
const verdict = (name, formEntries) => policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { tag: 'button', role: 'button', name, ...(formEntries ? { formEntries } : {}) } })
const press = (name, formEntries) => { const v = verdict(name, formEntries); return v.decision === 'allow' ? 'allow' : (v.classes ?? [v.class]).slice().sort().join('+') }
const enter = (defaultButton) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Search', defaultButtonRead: true, defaultButton } }); return v.decision === 'allow' ? 'allow' : (v.classes ?? [v.class]).slice().sort().join('+') }

test('CU-585: a bare submit beside a prompt to type a word that confirms a destructive or permanent act asks delete', () => {
  assert.equal(press('Confirm', ['Type DELETE to confirm']), 'delete')
  assert.equal(press('Continue', ['Type DELETE to confirm']), 'delete')
  assert.equal(press('I understand', ['Type the project name to delete it']), 'delete')
  assert.equal(press('Confirm', ['To confirm, type "acme/prod" to delete this repository']), 'delete')
  assert.equal(press('Continue', ['Type ERASE to wipe this device']), 'delete')
  assert.equal(press('Proceed', ['Type REMOVE to remove all members']), 'delete')
  assert.equal(press('OK', ['Enter the workspace name to permanently delete it']), 'delete')
  assert.equal(press('Yes', ['Retype your email to close your account']), 'delete')
  assert.equal(press('Confirm', ['Repository name', 'This cannot be undone. Type the name to confirm.']), 'delete', 'the sense may span the form\'s texts')
})

test('CU-585: a typed confirmation of a transfer of ownership asks permission, not purchase', () => {
  assert.equal(press('Confirm', ['Type TRANSFER to move ownership']), 'permission')
  assert.equal(press('Continue', ['Enter the new owner\'s username']), 'permission')
  assert.equal(press('I understand', ['Retype the workspace name to hand it over']), 'permission')
})

test('CU-585: ordinary boxes add nothing - a bare submit stays free beside a name, a search, a message or a coupon', () => {
  for (const entries of [['Your name'], ['Search'], ['Note'], ['Type a message'], ['Coupon code'], ['Bio'], ['Enter your email'], ['Type to search members']]) {
    assert.equal(press('Confirm', entries), 'allow', JSON.stringify(entries))
    assert.equal(press('Continue', entries), 'allow', JSON.stringify(entries))
  }
  assert.equal(press('Confirm', ['This will delete the draft']), 'allow', 'a destructive word without a prompt to type is not a typed confirmation')
  assert.equal(press('Confirm'), 'allow', 'no formEntries: unchanged')
  assert.equal(press('Save', ['Type DELETE to confirm']), 'allow', 'only the bare confirm-like submits read the form (named limit)')
})

test('CU-585: formEntries only add - a submit another rule classes keeps its class', () => {
  assert.equal(press('Delete repository', ['Your name']), 'delete')
  assert.equal(press('Delete repository', ['Type TRANSFER to move ownership']), 'delete', 'the late union never reaches a classed name')
  assert.equal(press('Submit', ['Type DELETE to confirm']), press('Submit'), 'Submit is classed by its own name; the union stays out')
})

test('CU-585: Return presses the default button, judged as the click on it would be (CU-406) - with its formEntries', () => {
  assert.equal(enter({ name: 'Confirm', formEntries: ['Type DELETE to confirm'] }), 'delete')
  assert.equal(enter({ name: 'Confirm', formEntries: ['Type TRANSFER to move ownership'] }), 'permission')
  assert.equal(enter({ name: 'Confirm', formEntries: ['Coupon code'] }), 'allow')
})

test('CU-585: typedConfirmClasses reads at most three texts of 80 characters, by sense', () => {
  assert.deepEqual(typedConfirmClasses(['Type DELETE to confirm']), ['delete'])
  assert.deepEqual(typedConfirmClasses(['Type TRANSFER and DELETE to confirm']), ['delete', 'permission'])
  assert.deepEqual(typedConfirmClasses(['a', 'b', 'c', 'Type DELETE to confirm']), [], 'a fourth text is never read')
  assert.deepEqual(typedConfirmClasses([`Type DELETE to confirm ${'x'.repeat(70)}`]), [], 'over 80 characters is none')
  assert.deepEqual(typedConfirmClasses('Type DELETE to confirm'), [])
  assert.deepEqual(typedConfirmClasses([]), [])
})
