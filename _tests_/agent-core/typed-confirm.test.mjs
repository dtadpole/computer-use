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
  for (const name of ['Go ahead', "Yes, I'm sure", 'Got it, continue', 'Proceed anyway']) assert.equal(press(name, ['Type DELETE to confirm']), 'delete', name)
  assert.equal(press('Confirm now', ['Type DELETE to confirm']), press('Confirm now'), 'a label another rule classes keeps its own class (late union)')
})

test('CU-585 r6: any otherwise-unclassed button in the form reads the prompt, except one that backs out (cu-researcher r5 private set)', () => {
  assert.equal(press('Yes, do it', ['Type the volume label to reformat it']), 'delete')
  assert.equal(press('Next step', ['Enter the new owner handle and the repo name to hand it off']), 'permission')
  assert.equal(press('Alright', ['Retype the space key to delete the space']), 'delete')
  for (const name of ['Rename anyway', 'Continue to profile', 'Save draft', 'Got it', 'Let us proceed']) assert.equal(press(name, ['Type DELETE to confirm']), 'delete', name)
  for (const name of ['Cancel', 'Back', 'Go back', 'Close', 'No', 'No, keep it', 'Never mind', 'Keep the repository', "Don't delete", 'Not now', 'Maybe later', '\u00d7']) assert.equal(press(name, ['Type DELETE to confirm']), 'allow', `${name}: backing out is never asked`)
})

test('CU-585 r7: pass / give / assign it to a new admin or owner; clipboard and help buttons never read the prompt (cu-researcher r6)', () => {
  assert.equal(press('Move ahead', ['Type the workspace handle to pass it to a new admin']), 'permission')
  assert.equal(press('Confirm', ['Enter the repo name to give it to another owner']), 'permission')
  assert.equal(press('Next', ['Retype the project slug to assign it to a different team']), 'permission')
  assert.equal(press('Continue', ['Type the org name to make Sam the new admin']), 'permission')
  for (const name of ['Copy', 'Copy name', 'Show', 'Reveal', 'Learn more', 'Help', '?', 'Paste', 'Clear', "What's this?"]) assert.equal(press(name, ['Type DELETE to confirm']), 'allow', `${name}: a utility beside the box confirms nothing`)
  assert.equal(press('Show password', ['Type DELETE to confirm']), press('Show password'), "a utility another rule classes keeps that class (main's credential)")
})

test('CU-585 r8: gerund typing words (author-found at r7)', () => {
  assert.equal(press('Confirm', ['Confirm by typing DELETE']), 'delete')
  assert.equal(press('Proceed', ['Confirm deletion by entering the project ID']), 'delete')
  assert.equal(press('Done', ['Retyping the name deletes the bucket']), 'delete')
  assert.equal(press('OK', ['Confirm the handover by typing the new owner handle']), 'permission')
  assert.equal(press('Search', ['Start typing to search deleted items']), 'allow', 'a gerund followed by to is still a search box')
  assert.equal(press('Save', ['Typing your name helps teammates']), 'allow')
})

test('CU-585 r8: more purpose verbs on the destroy side (cu-researcher r7 private set)', () => {
  assert.equal(press('Understood', ['Enter the database name to drop it for good']), 'delete')
  assert.equal(press('Fine', ['Type CLOSE to shut the account down']), 'delete')
  assert.equal(press('Confirm', ['Type the project key to close it permanently']), 'delete')
  assert.equal(press('OK', ['Type KILL to kill all sessions and their data']), 'delete')
  assert.equal(press('Continue', ['Type the API name to sunset it']), 'delete')
  assert.equal(press('Next', ['Type the plan name to cancel the account']), 'delete')
  assert.equal(press('Done', ['Type the label to retire it']), 'delete')
  assert.equal(press('Save', ['Type a name for the drop zone']), 'allow', "'drop zone' is no 'drop it'")
  assert.equal(press('Save', ['Enter a reason to close this ticket']), 'allow', 'closing a ticket is not shutting it down')
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

// Owner spec 07:33Z (cu-verifier's close-account row on e512bf2, 073145Z-3a3d87): the zone's own heading and description
// (the driver's zoneWords) join the destroy / transfer test; the typing instruction still has to come from the entries.
const zoned = (name, formEntries, zoneWords) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { tag: 'button', role: 'button', name, formEntries, ...(zoneWords ? { zoneWords } : {}) } }); return v.decision === 'allow' ? 'allow' : (v.classes ?? [v.class]).slice().sort().join('+') }

test('CU-585 close-account zone: the zone\'s heading and description join the destroy test (zoneWords)', () => {
  assert.equal(zoned('Continue', ['Type CLOSE to confirm']), 'allow', 'a bare typed CLOSE alone stays free - it also closes dialogs')
  assert.equal(zoned('Continue', ['Type CLOSE to confirm'], ['Close this account permanently.', 'This cannot be undone.']), 'delete', "cu-verifier's held-out row")
  assert.equal(zoned('Confirm', ['Type CLOSE to confirm'], ['Close your account']), 'delete', 'a determiner slot: close your account')
  assert.equal(zoned('Confirm', ['Type CLOSE to confirm'], ['Danger zone', 'Closing your account is permanent.']), 'delete')
  assert.equal(zoned('Confirm', ['Type the workspace name'], ['Transfer ownership to another admin']), 'permission', 'a transfer in the description')
  for (const near of [['Close this dialog'], ['Close panel'], ['Close the sidebar'], ['Account settings'], ['Your account is active.']]) {
    assert.equal(zoned('Continue', ['Type CLOSE to confirm'], near), 'allow', `near miss ${JSON.stringify(near)}`)
  }
  assert.equal(zoned('Continue', ['Account name'], ['Type CLOSE to confirm.', 'Close this account permanently.']), 'allow', 'zone words never supply the typing instruction')
  assert.equal(zoned('Continue', ['Your name'], ['Delete your account permanently.']), 'allow', 'an ordinary box beside a destructive heading stays free (no prompt to type)')
  assert.equal(zoned('Delete account', ['Your name'], ['Close panel']), 'delete', 'a classed name keeps its class')
  assert.deepEqual(typedConfirmClasses(['Type CLOSE to confirm'], ['a', 'b', 'c', 'This cannot be undone.']), [], 'a fourth zone text is never read')
  assert.deepEqual(typedConfirmClasses(['Type CLOSE to confirm'], [`Close this account permanently ${'x'.repeat(60)}`]), [], 'a zone text over 80 characters is none')
  assert.deepEqual(typedConfirmClasses(['Type CLOSE to confirm'], 'Close this account permanently.'), [], 'zoneWords must be a list')
})

test("CU-585 zone words need a confirm-shaped entry (policy owner 08:07Z): ordinary forms' paragraphs never reach the destroy test", () => {
  // the policy owner's four rows on the test merge with main 8d43b3df - all free on main, and free again with the gate
  assert.equal(zoned('Next', ['Enter your phone number'], ['We will remove it if you ask.']), 'allow')
  assert.equal(zoned('Save', ['Type a new display name'], ['Remove your photo in Settings.']), 'allow')
  assert.equal(zoned('Continue', ['Enter your work email'], ['Cancel anytime.', 'Your data is deleted after 30 days.']), 'allow')
  assert.equal(zoned('Apply', ['Enter a coupon code'], ['Expired codes are removed automatically.']), 'allow')
  assert.equal(zoned('Confirm', ['Enter PIN'], ['Your card is closed permanently after three wrong tries.']), 'allow', 'a field acronym in capitals is no confirm token')
  assert.equal(zoned('Continue', ['Enter the 6-digit code'], ['This cannot be undone.']), 'allow', 'a code entry is not confirm-shaped')
  assert.equal(zoned('Continue', ['Type your full name'], ['Close this account permanently.']), 'allow')
  // confirm shapes keep the zone words
  for (const entry of ['Type CLOSE to confirm', 'Please type LEAVE below', 'Confirm by typing CLOSE', 'Type "acme/prod"', 'Type the workspace name', 'Enter the name of the project', 'Enter the repository URL', 'Enter the 6-digit code to confirm']) {
    assert.equal(zoned('Continue', [entry], ['Close this account permanently.']), 'delete', entry)
  }
  assert.equal(zoned('Confirm', ['Type DELETE to confirm']), 'delete', "entries alone keep #894's behaviour")
  assert.equal(zoned('Confirm', ['Enter the workspace name to permanently delete it']), 'delete')
})
