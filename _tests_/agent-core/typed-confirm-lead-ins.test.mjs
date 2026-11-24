import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy, typedConfirmClasses } from '../../_tools_/agent-core/policy.mjs'

// CU-765 (High; cu-researcher's CU-764 held-out): courtesy, aspect and purpose lead-ins before the imperative are stripped by one
// general rule before the imperative is read (cu-coordinator 10:37Z: not more phrases).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://code.example/org/repo/settings'
const press = (name, formEntries) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { tag: 'button', role: 'button', name, formEntries } }); return v.decision === 'allow' ? 'allow' : (v.classes ?? [v.class]).slice().sort().join('+') }

test('CU-765: the filed rows ask', () => {
  assert.equal(press('OK', ['Please take a moment to put down the project ID.', 'The project is erased for good.']), 'delete', 'courtesy + aspect')
  assert.equal(press('Continue', ['Do jot down the team handle.', 'Ownership passes to the new owner.']), 'permission', "an emphatic 'do'")
  assert.equal(press('Proceed', ['Kindly go on to give the cluster name.', 'The cluster will be terminated.']), 'delete', "'go on to'")
})

test('CU-765: the strip is general (shapes beyond the filed rows)', () => {
  assert.deepEqual(typedConfirmClasses(['Name'], ['Be sure to note down the bucket name.', 'The bucket will be deleted.']), ['delete'], "'be sure to'")
  assert.deepEqual(typedConfirmClasses(['ID'], ['We need you to read out the instance ID.', 'The instance will be terminated.']), ['delete'], "'we need you to'")
  assert.deepEqual(typedConfirmClasses(['Name'], ['Before we remove anything for good, jot down the repository name.', 'This repository will be deleted.']), ['delete'], 'after a leading clause')
  assert.deepEqual(typedConfirmClasses(['Slug'], ["Please don't forget to fill in the workspace slug.", 'All workspace data will be erased.']), ['delete'], 'a chain of lead-ins')
})

test('CU-765 r2: a lead-in with a comma, and a read-off particle', () => {
  assert.deepEqual(typedConfirmClasses(['ID'], ['Now, carefully fill out the database ID.', 'The database will be deleted.']), ['delete'], "cu-researcher's held-out miss ('Now,' + 'carefully')")
  assert.deepEqual(typedConfirmClasses(['Label'], ['To be safe, read off the volume label and enter it.', 'The volume will be erased.']), ['delete'], "cu-researcher's held-out miss ('read off')")
  assert.deepEqual(typedConfirmClasses(['Name'], ['Next, jot down the bucket name.', 'The bucket will be deleted.']), ['delete'], "'Next,'")
  assert.deepEqual(typedConfirmClasses(['ID'], ['Now, carefully fill out the database ID.', 'Used for connection strings.']), [], 'the same entry in a zone with no act stays free')
  assert.deepEqual(typedConfirmClasses(['Label'], ['To be safe, read off the volume label and enter it.', 'Pick a template next.']), [], 'a zone with no act stays free')
})

test('CU-765 near rows stay free', () => {
  assert.equal(press('Save', ['Please take a moment to put down the project ID.', 'Used in API keys.']), 'allow', "cu-researcher's near row (no act)")
  assert.deepEqual(typedConfirmClasses(['Name'], ['Please take a moment to give your workspace a name.', 'You can change it later.']), [], 'a naming, no act')
  assert.deepEqual(typedConfirmClasses(['Name'], ['Kindly go on to change the project name.', 'The project will be deleted later by an admin.']), [], 'a rename verb stays excluded after the strip')
})
