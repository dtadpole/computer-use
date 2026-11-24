import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy, typedConfirmClasses } from '../../_tools_/agent-core/policy.mjs'

// CU-751 (High; cu-coordinator 07:03Z): any imperative verb before 'the <x> name / ID / slug / handle / label' in a destroy or
// transfer zone opens the typed-confirm instruction - a general rule, not another verb list.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://code.example/org/repo/settings'
const press = (name, formEntries) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { tag: 'button', role: 'button', name, formEntries } }); return v.decision === 'allow' ? 'allow' : (v.classes ?? [v.class]).slice().sort().join('+') }

test('CU-751: the filed rows ask (generic button, entry words)', () => {
  assert.equal(press('Confirm', ['State the name of the project you are deleting.', 'The project will be removed permanently.']), 'delete')
  assert.equal(press('Continue', ['Give the cluster ID below.', 'The cluster will be terminated.']), 'delete')
  assert.equal(press('OK', ['Mention the workspace slug to proceed.', 'All workspace data will be erased.']), 'delete')
  assert.equal(press('Confirm', ['Identify the database by its name.', 'This database will be dropped.']), 'delete')
})

test('CU-751: the shape, as entry + zone', () => {
  assert.deepEqual(typedConfirmClasses(['Cluster'], ['Give the cluster ID below.', 'The cluster will be terminated.']), ['delete'])
  assert.deepEqual(typedConfirmClasses(['Name'], ['To confirm, quote the repository name.', 'The repository will be deleted.']), ['delete'], 'after a comma')
  assert.deepEqual(typedConfirmClasses(['Handle'], ['Please key the organization handle.', 'Ownership passes to the new owner.']), ['permission'], 'a transfer zone')
  assert.deepEqual(typedConfirmClasses(['Name'], ['Repeat its name exactly.', 'This project will be deleted.']), ['delete'], "'its name'")
})

test('CU-751 near collisions stay free', () => {
  assert.equal(press('Save', ['State the name of your project.', 'Shown in the sidebar.']), 'allow', "cu-researcher's free row")
  assert.equal(press('Next', ['Bucket name (for your records):', 'Choose a storage class next.']), 'allow', "cu-researcher's free row")
  assert.deepEqual(typedConfirmClasses(['Name'], ['Change the project name.', 'Renaming keeps every file.']), [], 'a rename')
  assert.deepEqual(typedConfirmClasses(['ID'], ['The cluster ID is shown below.', 'The cluster will be terminated.']), [], 'a statement, not an imperative')
  assert.deepEqual(typedConfirmClasses(['ID'], ['Your user ID is required.', 'Your account will be deleted.']), [], 'no imperative; a personal field')
  assert.deepEqual(typedConfirmClasses(['Notes'], ['Describe the reason below.', 'Your account will be deleted.']), [], 'no name word')
  // policy owner 07:10Z: rename / edit verbs are a settings page, not a confirm - even beside an act
  assert.deepEqual(typedConfirmClasses(['Name'], ['Change the workspace name below.', 'Old drafts are deleted after 30 days.']), [], 'a rename beside a retention note')
  assert.deepEqual(typedConfirmClasses(['ID'], ['Edit the cluster ID.', 'The cluster will be terminated.']), [], 'an edit verb')
  assert.deepEqual(typedConfirmClasses(['Name'], ['Choose the project name.', 'Old builds will be removed.']), [], 'a choose verb')
  assert.deepEqual(typedConfirmClasses(['Name'], ['Change the name to confirm.', 'The project will be deleted.']), [], "a rename verb + 'to confirm' stays a rename (no typing word)")
})

test('CU-751: confirm verbs still ask (not rename verbs)', () => {
  assert.deepEqual(typedConfirmClasses(['Name'], ['Retype the project name.', 'The project will be deleted.']), ['delete'])
  assert.deepEqual(typedConfirmClasses(['Name'], ['Re-enter the project name.', 'The project will be deleted.']), ['delete'])
  assert.deepEqual(typedConfirmClasses(['Name'], ['Repeat the project name.', 'The project will be deleted.']), ['delete'])
})
