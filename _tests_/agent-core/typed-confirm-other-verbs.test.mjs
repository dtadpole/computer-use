import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy, typedConfirmClasses } from '../../_tools_/agent-core/policy.mjs'

// CU-745 (High; cu-researcher's sweep 5): English typed-confirm instructions with other verbs - provide, supply, specify, insert,
// put in, 'confirm the <x> name' - and a '<x> name to confirm' label act unasked in a destroy / transfer zone.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://code.example/org/repo/settings'
const press = (name, formEntries) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { tag: 'button', role: 'button', name, formEntries } }); return v.decision === 'allow' ? 'allow' : (v.classes ?? [v.class]).slice().sort().join('+') }

test('CU-745: the filed rows ask (generic button, entry words)', () => {
  assert.equal(press('Confirm', ['Provide the bucket name to confirm.', 'The bucket will be deleted.']), 'delete')
  assert.equal(press('Continue', ['Please provide the project name to proceed.', 'The project will be deleted.']), 'delete')
  assert.equal(press('OK', ['Supply the workspace name below.', 'Deleting the workspace cannot be undone.']), 'delete')
  assert.equal(press('Proceed', ['Specify the cluster name.', 'The cluster will be destroyed.']), 'delete')
  assert.equal(press('Confirm', ['Insert the project name.', 'The project will be erased.']), 'delete')
  assert.equal(press('Continue', ['Put in the database name.', 'This database will be dropped.']), 'delete')
  assert.equal(press('Confirm', ['Please confirm the repository name.', 'The repository will be deleted.']), 'delete')
  assert.equal(press('OK', ['Project name to confirm deletion', 'This cannot be undone.']), 'delete', 'a label with no colon')
  assert.equal(press('Confirm', ['Provide the team name to confirm.', 'Ownership moves to Sam.']), 'permission')
})

test('CU-745: the same shapes as entry + zone (typedConfirmClasses)', () => {
  assert.deepEqual(typedConfirmClasses(['Bucket name'], ['Provide the bucket name to confirm.', 'The bucket will be deleted.']), ['delete'])
  assert.deepEqual(typedConfirmClasses(['Cluster'], ['Specifying the cluster name confirms it.', 'The cluster will be destroyed.']), ['delete'], 'a gerund')
  assert.deepEqual(typedConfirmClasses(['Name'], ['Please confirm your workspace name.', 'Your workspace will be deleted.']), ['delete'], "confirm 'your <x> name'")
  assert.deepEqual(typedConfirmClasses(['Repository'], ['Repository name to confirm', 'The repository will be deleted.']), ['delete'], 'the label in the zone')
})

test('CU-745 r2: cu-researcher\'s three held-out misses ask (entry + zone)', () => {
  assert.deepEqual(typedConfirmClasses(['Repository'], ['Indicate the repository name.', 'The repository will be deleted.']), ['delete'], "'indicate'")
  assert.deepEqual(typedConfirmClasses(['Label'], ['Specify the volume label to proceed.', 'The volume will be wiped.']), ['delete'], "'label' is a name word")
  assert.deepEqual(typedConfirmClasses(['Database name (required to delete):'], ['The database will be dropped.']), ['delete'], 'a label whose parenthetical names the act')
  assert.equal(press('Confirm', ['Indicate the repository name.', 'The repository will be deleted.']), 'delete')
  assert.equal(press('Confirm', ['Database name (required to delete):', 'The database will be dropped.']), 'delete')
  assert.deepEqual(typedConfirmClasses(['Name'], ['Team name (to confirm the transfer):', 'Ownership passes to the new owner.']), ['permission'], 'a parenthetical with a transfer')
})

test('CU-745 near collisions stay free', () => {
  assert.deepEqual(typedConfirmClasses(['ID'], ['Provide the workspace ID.', 'Used for API calls.']), [], "cu-researcher's near row (an API note)")
  assert.deepEqual(typedConfirmClasses(['Bucket'], ['Please supply the name of the bucket.', 'Pick a region next.']), [], "cu-researcher's near row (a region step)")
  assert.deepEqual(typedConfirmClasses(['Label'], ['Specify the volume label.', 'Rename the volume.']), [], "cu-researcher's near row (a rename)")
  assert.deepEqual(typedConfirmClasses(['Display name (optional):'], ['Shown on your profile.']), [], 'a parenthetical with no act')
  assert.equal(press('Save', ['Provide the project name.', 'Shown on the dashboard.']), 'allow', "cu-researcher's free row")
  assert.equal(press('Next', ['Specify the cluster name.', 'Pick a region next.']), 'allow', "cu-researcher's free row")
  assert.equal(press('Confirm', ['Please confirm the project name.', 'Rename the project.']), 'allow', "cu-researcher's free row (a rename)")
  assert.deepEqual(typedConfirmClasses(['Reason'], ['Confirm deletion', 'Tell us why you are leaving.']), [], "'Confirm deletion' is no typing instruction")
  assert.deepEqual(typedConfirmClasses(['Notes'], ['Provide feedback below.', 'Your feedback helps us improve.']), [], 'no act in the zone')
  assert.deepEqual(typedConfirmClasses(['Name'], ['Project name to confirm', 'Shown on the dashboard.']), [], 'the label with no act')
  assert.deepEqual(typedConfirmClasses(['Email'], ['Please confirm your email address.', 'Your account will be deleted.']), [], 'an e-mail is no name shape (personal field)')
})
