import assert from 'node:assert/strict'
import { test } from 'node:test'

import { typedConfirmClasses } from '../../_tools_/agent-core/policy.mjs'

// CU-736 (cu-researcher's sweep 4 and her CU-735 r2 rows): more English typed-confirm prompts inside a destroy zone ask.
test('CU-736: bare labels, hostname, name questions, confirm-by-typing and dropped databases ask', () => {
  assert.deepEqual(typedConfirmClasses(['Project'], ['Project name:', 'Deleting this project cannot be undone.']), ['delete'], 'bare label')
  assert.deepEqual(typedConfirmClasses(['Database'], ['Retype the database name.', 'The database will be dropped.']), ['delete'], 'dropped')
  assert.deepEqual(typedConfirmClasses(['Name'], ['Confirm the name by typing it.', 'The project will be deleted.']), ['delete'], 'confirm the name by typing it')
  assert.deepEqual(typedConfirmClasses(['Workspace'], ['What is the name of the workspace?', 'The workspace will be deleted.']), ['delete'], 'a name question')
  assert.deepEqual(typedConfirmClasses(['Database'], ['Your database name:', 'Dropping the database cannot be undone.']), ['delete'], 'possessive label + dropping')
  assert.deepEqual(typedConfirmClasses(['Host'], ["Write in your server's hostname.", 'The server will be destroyed.']), ['delete'], 'write in + hostname')
  assert.deepEqual(typedConfirmClasses(['Account'], ['Account name:', 'Your account will be erased.']), ['delete'], 'bare account label')
  assert.deepEqual(typedConfirmClasses(['Project name:'], ['This deletes the project.']), ['delete'], 'a bare label as the entry')
})

test('CU-736 near collisions stay free', () => {
  assert.deepEqual(typedConfirmClasses(['Name'], ['Name:', 'Deleting this project cannot be undone.']), [], "a bare 'Name:'")
  assert.deepEqual(typedConfirmClasses(['Display name'], ['Display name:', 'Old avatars are deleted.']), [], 'a profile label')
  assert.deepEqual(typedConfirmClasses(['New name'], ['New name:', 'The old name is removed from links.']), [], 'a rename label')
  assert.deepEqual(typedConfirmClasses(['Name'], ['What is your name?', 'Your account will be deleted.']), [], "'What is your name?'")
  assert.deepEqual(typedConfirmClasses(['Project'], ['Project name:', 'Projects are listed below.']), [], 'a label with no act')
  assert.deepEqual(typedConfirmClasses(['Search'], ['Confirm the name by typing it.', 'Results appear below.']), [], 'confirm-by-typing with no act')
  assert.deepEqual(typedConfirmClasses(['Project name'], ['Project name', 'Deleting this project cannot be undone.']), [], 'a heading without a colon')
})

test("CU-736 r2 (cu-researcher's NOT OK at 0cdf35f48): the filed row as an entry, verify-by-typing, which-questions, 'Name of the <x> to <act>:'", () => {
  assert.deepEqual(typedConfirmClasses(['Confirm the name by typing it.'], ['The project will be deleted.']), ['delete'], 'the filed row as the entry')
  assert.deepEqual(typedConfirmClasses(['Name'], ['Verify the name by typing it below.', 'The project will be deleted.']), ['delete'], 'verify by typing (zone)')
  assert.deepEqual(typedConfirmClasses(['Verify the name by typing it below.'], ['The project will be deleted.']), ['delete'], 'verify by typing (entry)')
  assert.deepEqual(typedConfirmClasses(['Repository'], ['Which repository are you deleting?', 'Its issues and wiki are removed too.']), ['delete'], 'a which-question naming the act')
  assert.deepEqual(typedConfirmClasses(['Which repository are you deleting?'], []), ['delete'], 'a which-question as the entry')
  assert.deepEqual(typedConfirmClasses(['Space'], ['Name of the space to delete:', 'All pages in the space are erased.']), ['delete'], "'Name of the <x> to <act>:'")
  assert.deepEqual(typedConfirmClasses(['Verify your email by typing the code.'], ['Your account will be deleted.']), [], 'verify an email by a code: no name')
  assert.deepEqual(typedConfirmClasses(['Plan'], ['Which plan are you choosing?', 'Your old plan is removed.']), [], 'a which-question with no act of its own')
  assert.deepEqual(typedConfirmClasses(['Project'], ['Name of the new project:', 'Old drafts are deleted after 30 days.']), [], "'Name of the new project:' (create)")
})
