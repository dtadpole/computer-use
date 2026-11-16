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

test('CU-585: any generic submit reads the form - Next, Done, Save, Finish, Apply, Go (cu-researcher r1 held-out)', () => {
  for (const name of ['Next', 'Done', 'Save', 'Finish', 'Apply', 'Go', 'Accept', "I'm sure", 'Yes, continue']) assert.equal(press(name, ['Type DELETE to confirm']), 'delete', name)
  assert.equal(press('Next', ['Retype the organisation handle to hand it over']), 'permission')
  assert.equal(press('Done', ['Type the transfer reference']), 'allow')
})

test('CU-585: other typing verbs and purpose clauses (cu-researcher r3 variants)', () => {
  assert.equal(press('Finish', ['Key in NUKE to wipe the server']), 'delete')
  assert.equal(press('Proceed', ['Spell out the bucket name to empty it']), 'delete')
  assert.equal(press('Go', ['Repeat the handle to give the account away']), 'permission')
  assert.equal(press('OK', ['Input the slug to archive it forever']), 'delete')
  assert.equal(press('Continue', ['Re-enter the cluster name to tear it down']), 'delete')
  assert.equal(press('Confirm', ['Fill in the domain to decommission it']), 'delete')
  assert.equal(press('Next', ['Copy the team name to hand it off to Sam']), 'permission')
  assert.equal(press('Next', ['Type TRANSFER to confirm']), 'allow', 'a bare TRANSFER word (ownership or amount) is for the ruling - free, named')
  assert.equal(press('Done', ['Fill in your city']), 'allow')
  assert.equal(press('Save', ['Repeat your new password']), 'allow')
  assert.equal(press('Continue', ['Enter your name to stay signed in forever']), 'allow', 'forever alone is no destroy sense')
})

test('CU-585: a generic submit is matched by its words; more purpose verbs (cu-researcher r4 private set)', () => {
  assert.equal(press('Continue anyway', ['Re-enter the repo path to move it to another owner']), 'permission')
  assert.equal(press('OK, proceed', ['Fill in the app name to uninstall it for everyone']), 'delete')
  for (const name of ['Go ahead', "Yes, I'm sure", 'Got it, continue', 'Proceed anyway', 'Confirm now']) assert.equal(press(name, ['Type DELETE to confirm']), 'delete', name)
  for (const name of ['Rename anyway', 'Continue to profile', 'Save draft', 'Go to settings']) assert.equal(press(name, ['Type DELETE to confirm']), 'allow', `${name}: a named act or destination is not a generic submit`)
})

test('CU-585: a typed confirmation of a transfer of ownership asks permission, not purchase', () => {
  assert.equal(press('Confirm', ['Type TRANSFER to move ownership']), 'permission')
  assert.equal(press('Continue', ['Enter the new owner\'s username']), 'permission')
  assert.equal(press('I understand', ['Retype the workspace name to hand it over']), 'permission')
  assert.equal(press('Confirm', ['Type the repo name to transfer the repository']), 'permission')
})

test('CU-585: ordinary boxes add nothing - a bare submit stays free beside a name, a search, a message or a coupon', () => {
  for (const entries of [['Your name'], ['Search'], ['Note'], ['Type a message'], ['Coupon code'], ['Bio'], ['Enter your email'], ['Type to search members']]) {
    assert.equal(press('Confirm', entries), 'allow', JSON.stringify(entries))
    assert.equal(press('Continue', entries), 'allow', JSON.stringify(entries))
  }
  assert.equal(press('Confirm', ['This will delete the draft']), 'allow', 'a destructive word without a prompt to type is not a typed confirmation')
  // cu-developer-three's near-misses at 4634f4df: an adjective 'permanent' and a money 'transfer' are no typed confirmation.
  assert.equal(press('Confirm', ['Enter your permanent address']), 'allow')
  assert.equal(press('Continue', ['Enter the transfer amount']), 'allow')
  assert.equal(press('Continue', ['Type the transfer reference']), 'allow')
  assert.equal(press('Confirm'), 'allow', 'no formEntries: unchanged')
  assert.equal(press('Rename', ['Type DELETE to confirm']), 'allow', 'a named act other than a generic submit does not read the form (named limit)')
  // cu-researcher's r1 over-ask: a typing word followed by 'to' / 'here' is a search box, not a confirmation prompt.
  assert.equal(press('Confirm', ['Type to search deleted items']), 'allow')
  assert.equal(press('Go', ['Type here to filter removed files']), 'allow')
  assert.equal(press('OK', ['Press Enter to delete']), 'allow')
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
  assert.deepEqual(typedConfirmClasses(['Type the name to transfer ownership and delete the old team']), ['delete', 'permission'])
  assert.deepEqual(typedConfirmClasses(['Type TRANSFER to confirm the payment']), [], 'a bare TRANSFER token with no ownership is money, not a handover')
  assert.deepEqual(typedConfirmClasses(['a', 'b', 'c', 'Type DELETE to confirm']), [], 'a fourth text is never read')
  assert.deepEqual(typedConfirmClasses([`Type DELETE to confirm ${'x'.repeat(70)}`]), [], 'over 80 characters is none')
  assert.deepEqual(typedConfirmClasses('Type DELETE to confirm'), [])
  assert.deepEqual(typedConfirmClasses([]), [])
})
